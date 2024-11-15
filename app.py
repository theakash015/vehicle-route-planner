
import math
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
import urllib
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
import os
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv('API_KEY')


def validate_address(address):
    geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?address={address}&key={API_KEY}"
    with urllib.request.urlopen(geocode_url) as response:
        jsonResult = response.read()
    geocode_response = json.loads(jsonResult)
    if geocode_response['status'] == 'OK':
        result = geocode_response['results'][0]
        formatted_address = result['formatted_address']
        latitude = result['geometry']['location']['lat']
        longitude = result['geometry']['location']['lng']
        return {
            'formatted_address': formatted_address.replace(" ", "+"),
            'latitude': latitude,
            'longitude': longitude
        }
    else:
        return None

def create_distance_matrix(addresses):
    if not addresses:
        return []

    max_elements = 100
    num_addresses = len(addresses)
    max_rows = max_elements // num_addresses
    q, r = divmod(num_addresses, max_rows)
    dest_addresses = [address['formatted_address'] for address in addresses]
    distance_matrix = []

    for i in range(num_addresses):
        distance_matrix.append([0] * num_addresses)

    for i in range(q):
        origin_addresses = [address['formatted_address'] for address in addresses[i * max_rows: (i + 1) * max_rows]]
        response = send_request(origin_addresses, dest_addresses)
        distance_matrix = update_distance_matrix(distance_matrix, response, i * max_rows, 0)

    if r > 0:
        origin_addresses = [address['formatted_address'] for address in addresses[q * max_rows: q * max_rows + r]]
        response = send_request(origin_addresses, dest_addresses)
        distance_matrix = update_distance_matrix(distance_matrix, response, q * max_rows, 0)

    return symmetrize_matrix(distance_matrix)

def send_request(origin_addresses, dest_addresses):
    def build_address_str(addresses):
        address_str = ''
        for i in range(len(addresses) - 1):
            address_str += addresses[i] + '|'
        address_str += addresses[-1]
        return address_str

    request = 'https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial'
    origin_address_str = build_address_str(origin_addresses)
    dest_address_str = build_address_str(dest_addresses)
    request = request + '&origins=' + origin_address_str + '&destinations=' + \
        dest_address_str + '&key=' + API_KEY
    with urllib.request.urlopen(request) as response:
        jsonResult = response.read()
    response = json.loads(jsonResult)
    return response

def update_distance_matrix(distance_matrix, response, origin_offset, dest_offset):
    for i, row in enumerate(response['rows']):
        for j, element in enumerate(row['elements']):
            if 'distance' in element:
                distance_value = element['distance']['value']
                distance_matrix[origin_offset + i][dest_offset + j] = distance_value
            else:
                distance_matrix[origin_offset + i][dest_offset + j] = float('inf')
    return distance_matrix

def decimal_to_int(decimal):
    if decimal % 1 >= 0.5:
        rounded_value = math.ceil(decimal)
    else:
        rounded_value = math.floor(decimal)
    return rounded_value

def meter_to_km(meter):
    kms = decimal_to_int(meter / 1000)
    return kms

def symmetrize_matrix(matrix):
    num_addresses = len(matrix)
    for i in range(num_addresses):
        for j in range(i + 1, num_addresses):
            avg_distance = (matrix[i][j] + matrix[j][i]) / 2           
            matrix[i][j] = meter_to_km(avg_distance)
            matrix[j][i] = meter_to_km(avg_distance)
    return matrix

def create_data_model(distance_matrix):
    data = {}
    data["distance_matrix"] = distance_matrix
    data["num_vehicles"] = 4  # Adjust as needed
    data["depot"] = 0
    return data

def calculate_routes(distance_matrix):
    data = create_data_model(distance_matrix)
    manager = pywrapcp.RoutingIndexManager(len(data["distance_matrix"]), data["num_vehicles"], data["depot"])
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return data["distance_matrix"][from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    dimension_name = 'Distance'
    routing.AddDimension(
        transit_callback_index,
        0,  # no slack
        3000,  # vehicle maximum travel distance
        True,  # start cumul to zero
        dimension_name)
    distance_dimension = routing.GetDimensionOrDie(dimension_name)
    distance_dimension.SetGlobalSpanCostCoefficient(100)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)

    solution = routing.SolveWithParameters(search_parameters)

    if solution:
        routes = []
        route_distances = []
        total_distance = 0

        for vehicle_id in range(data['num_vehicles']):
            index = routing.Start(vehicle_id)
            route = []
            route_distance = 0
            while not routing.IsEnd(index):
                route.append(manager.IndexToNode(index))
                next_index = solution.Value(routing.NextVar(index))
                route_distance += routing.GetArcCostForVehicle(index, next_index, vehicle_id)
                index = next_index
            route.append(manager.IndexToNode(index))
            routes.append(route)
            route_distances.append(route_distance)
            total_distance += route_distance

        return routes, route_distances, total_distance
    else:
        return None, None, None


@app.route('/validate_address', methods=['POST'])
def validate_address_endpoint():
    data = request.get_json()
    address = data.get('address')
    validated_address = validate_address(address)
    if validated_address:
        return jsonify({'status': 'success', 'validated_address': validated_address})
    else:
        return jsonify({'status': 'error', 'message': 'Address could not be validated.'})

@app.route('/update_distance_matrix', methods=['POST'])
def update_distance_matrix_endpoint():
    data = request.get_json()
    new_address = data.get('new_address')
    current_matrix = data.get('current_matrix', [])
    addresses = data.get('addresses', [])

    addresses.append(new_address)
    distance_matrix = create_distance_matrix(addresses)

    return jsonify({'status': 'success', 'distance_matrix': distance_matrix, 'addresses': addresses})

@app.route('/calculate_routes', methods=['POST'])
def calculate_routes_endpoint():
    data = request.get_json()
    distance_matrix = data.get('distance_matrix')
    routes, route_distances, total_distance = calculate_routes(distance_matrix)
    if routes:
        return jsonify({
            'status': 'success', 
            'routes': routes, 
            'route_distances': route_distances, 
            'total_distance': total_distance
        })
    else:
        return jsonify({'status': 'error', 'message': 'Could not calculate routes.'})


if __name__ == '__main__':
    app.run(debug=True)


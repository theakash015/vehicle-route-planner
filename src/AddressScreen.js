import React, { useState } from "react";
import axios from "axios";

function AddressScreen({ onRouteCalculated }) {
  const [address, setAddress] = useState("");
  const [distanceMatrix, setDistanceMatrix] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routeDistances, setRouteDistances] = useState([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState(null);

  const getAddressLabel = (index) => {
    return `Stop ${index}`;
  };

  const handleValidateAddress = async () => {
    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/validate_address",
        { address }
      );
      if (response.data.status === "success") {
        const validatedAddress = response.data.validated_address;
        const updateResponse = await axios.post(
          "http://127.0.0.1:5000/update_distance_matrix",
          {
            new_address: validatedAddress,
            current_matrix: distanceMatrix,
            addresses,
          }
        );
        if (updateResponse.data.status === "success") {
          setDistanceMatrix(updateResponse.data.distance_matrix);
          setAddresses(updateResponse.data.addresses);
        } else {
          console.error(updateResponse.data.message);
        }
      } else {
        console.error(response.data.message);
      }
    } catch (error) {
      console.error("Error validating address:", error);
    }
  };

  const handleCalculateRoutes = async () => {
    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/calculate_routes",
        {
          distance_matrix: distanceMatrix,
        }
      );
      if (response.data.status === "success") {
        setRoutes(response.data.routes);
        setRouteDistances(response.data.route_distances);
        setTotalDistance(response.data.total_distance);
      } else {
        console.error(response.data.message);
      }
    } catch (error) {
      console.error("Error calculating routes:", error);
    }
  };

  const renderTable = () => {
    return (
      <table>
        <thead>
          <tr>
            <th>Addresses</th>
            {addresses.map((_, index) => (
              <th key={index}>{getAddressLabel(index)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {distanceMatrix.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td>{getAddressLabel(rowIndex)}</td>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderAddressList = () => {
    return (
      <ul>
        {addresses.map((address, index) => (
          <li key={index}>
            {getAddressLabel(index)}:{" "}
            {address.formatted_address.replace(/\+/g, " ")} (Lat:{" "}
            {address.latitude}, Lng: {address.longitude})
          </li>
        ))}
      </ul>
    );
  };

  const renderRoutes = () => {
    return (
      <div>
        <h3>Routes:</h3>
        {routes.map((route, index) => (
          <div key={index}>
            <h4>
              <label>
                <input
                  type="radio"
                  name="selectedRoute"
                  value={index}
                  onChange={() => setSelectedRoute(index)}
                />
                Vehicle {index + 1}
              </label>
            </h4>
            <p>{route.join(" -> ")}</p>
            <p>Distance: {routeDistances[index]} km</p>
          </div>
        ))}
        <h4>Total Distance: {totalDistance} km</h4>
      </div>
    );
  };

  const renderSelectedRoute = () => {
    if (selectedRoute !== null) {
      const route = routes[selectedRoute];
      const origin = addresses[route[0]].formatted_address.replace(/\+/g, " ");
      const destination = addresses[
        route[route.length - 1]
      ].formatted_address.replace(/\+/g, " ");
      const waypoints = route
        .slice(1, -1)
        .map((index) => addresses[index].formatted_address.replace(/\+/g, " "));

      const routeObject = {
        origin,
        destination,
        waypoints,
      };

      onRouteCalculated(routeObject);

      return (
        <div>
          <h3>Selected Route:</h3>
          <pre>{JSON.stringify(routeObject, null, 2)}</pre>
          <h4>Vehicle {selectedRoute + 1}</h4>
          <p>{route.join(" -> ")}</p>
          <p>Distance: {routeDistances[selectedRoute]} km</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="AddressScreen">
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter address"
      />
      <button onClick={handleValidateAddress}>Validate Address</button>
      {distanceMatrix.length > 0 && renderTable()}
      {addresses.length > 0 && renderAddressList()}
      <button onClick={handleCalculateRoutes}>Calculate Routes</button>
      {routes.length > 0 && renderRoutes()}
      {renderSelectedRoute()}
    </div>
  );
}

export default AddressScreen;

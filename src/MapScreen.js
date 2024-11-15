import React from "react";
import styled from "styled-components";
import moment from "moment";
import { color } from "./constants";
import { Map, GoogleApiWrapper } from "google-maps-react";
import { Button, Typography } from "@material-ui/core";

const Page = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  overflow: visible;
`;

const Card = styled.div`
  display: flex;
  flex-flow: row nowrap;
  width: 100%;
  position: absolute;
  bottom: 0;
  left: 0;
  background: white;
  justify-content: space-between;
  align-items: center;
`;

const CardItem = styled.div`
  flex: 1;
  display: flex;
  flex-flow: column nowrap;
  padding: 24px;
`;

const StyledMap = styled(Map)`
  height: 100%;
  width: 100%;
`;

const GoButton = styled(Button)`
  color: white;
  background: ${color.green};
  &:hover {
    background: ${color.green1};
  }
`;

const toKms = (meters) => (meters * 0.001).toFixed(2);

function MapScreen({ google, stops }) {
  const [card, setCard] = React.useState(null);
  const mapRef = React.useRef(null);
  const directionsRenderer = React.useRef(new google.maps.DirectionsRenderer());

  React.useEffect(() => {
    const request = {
      origin: stops.origin,
      destination: stops.destination,
      waypoints: stops.waypoints.map((waypoint) => ({
        location: waypoint,
        stopover: true,
      })),
      optimizeWaypoints: true,
      provideRouteAlternatives: true,
      travelMode: "DRIVING",
      drivingOptions: {
        departureTime: new Date(/* now, or future date */),
        trafficModel: "pessimistic",
      },
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    };

    new google.maps.DirectionsService().route(request, (res, status) => {
      if (status === "OK") {
        const route = res.routes[0];
        const timeInSeconds = route.legs
          .map((leg) => leg.duration.value)
          .reduce((total, val) => total + val, 0);
        const routeWaypoints = route.waypoint_order.map(
          (i) => stops.waypoints[i]
        );

        const distances = route.legs.map((leg) =>
          parseFloat(toKms(leg.distance.value))
        );
        const distanceString = distances
          .map((distance) => `${distance.toFixed(2)} km`)
          .join(" -> ");
        const totalDistance = distances
          .reduce((total, distance) => total + distance, 0)
          .toFixed(2);

        const distanceMatrixService = new google.maps.DistanceMatrixService();
        distanceMatrixService.getDistanceMatrix(
          {
            origins: [stops.origin],
            destinations: [stops.destination, ...stops.waypoints],
            travelMode: "DRIVING",
            unitSystem: google.maps.UnitSystem.IMPERIAL,
          },
          (response, status) => {
            if (status === "OK") {
              const originToStopsDistances = response.rows[0].elements.map(
                (element, index) => ({
                  stop:
                    index === 0
                      ? stops.destination
                      : stops.waypoints[index - 1],
                  distance: toKms(element.distance.value),
                })
              );

              const distanceMatrixServiceWithDestination = new google.maps.DistanceMatrixService();
              distanceMatrixServiceWithDestination.getDistanceMatrix(
                {
                  origins: [
                    stops.origin,
                    ...stops.waypoints,
                    stops.destination,
                  ],
                  destinations: [
                    stops.origin,
                    ...stops.waypoints,
                    stops.destination,
                  ],
                  travelMode: "DRIVING",
                  unitSystem: google.maps.UnitSystem.IMPERIAL,
                },
                (response, status) => {
                  if (status === "OK") {
                    const distanceMatrix = response.rows.map((row, i) =>
                      row.elements.map((element, j) => ({
                        from:
                          i === 0
                            ? stops.origin
                            : i - 1 < stops.waypoints.length
                            ? stops.waypoints[i - 1]
                            : stops.destination,
                        to:
                          j === 0
                            ? stops.origin
                            : j - 1 < stops.waypoints.length
                            ? stops.waypoints[j - 1]
                            : stops.destination,
                        distance: toKms(element.distance.value),
                      }))
                    );

                    setCard({
                      time: `${Math.ceil(
                        moment.duration(timeInSeconds, "seconds").as("minutes")
                      )} min`,
                      distance: `${distanceString} = ${totalDistance} km`,
                      distanceMatrix,
                      optimizedStops: [
                        stops.origin,
                        ...routeWaypoints,
                        stops.destination,
                      ],
                      legDistances: distances,
                      link: `https://www.google.com/maps/dir/?api=1&origin=${encodeURI(
                        stops.origin
                      )}&destination=${encodeURI(
                        stops.destination
                      )}&waypoints=${encodeURI(routeWaypoints.join("|"))}`,
                    });

                    directionsRenderer.current.setDirections(res);
                  }
                }
              );
            }
          }
        );
      }
    });
  }, [google, stops]);

  React.useEffect(() => {
    if (mapRef.current) {
      directionsRenderer.current.setMap(mapRef.current.map);
    }
  }, [mapRef.current]);

  const handleDownloadJSON = () => {
    if (card) {
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(card, null, 2));
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "route_info.json");
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    }
  };

  const formatStopName = (index) => {
    if (index === 0) return "start";
    if (index === card.optimizedStops.length - 1) return "destination";
    return `stop${index}`;
  };

  const generateReferenceList = () => {
    let cumulativeDistance = 0;
    const referenceList = card.optimizedStops.map((stop, index) => {
      const distance = index === 0 ? 0 : card.legDistances[index - 1];
      cumulativeDistance += parseFloat(distance);
      return {
        name: formatStopName(index),
        address: stop,
        distance: `${distance} km`,
        cumulativeDistance: `${cumulativeDistance.toFixed(2)} km`,
      };
    });
    return referenceList;
  };

  return (
    <Page>
      <StyledMap google={google} ref={mapRef} />
      {card && (
        <Card>
          <CardItem>
            <Typography variant="h5" color="primary">
              Optimized Route Reference List:
            </Typography>
            <table border="1">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Optimized Route</th>
                  <th>Distance</th>
                  <th>Traveling Distance</th>
                </tr>
              </thead>
              <tbody>
                {generateReferenceList().map((item, index) => (
                  <tr key={index}>
                    <td>{item.name}</td>
                    <td>{item.address}</td>
                    <td>{item.distance}</td>
                    <td>{item.cumulativeDistance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Typography variant="h6" color="primary">
              Distance Matrix:
            </Typography>
            <table border="1">
              <thead>
                <tr>
                  <th>From/To</th>
                  {card.optimizedStops.map((_, index) => (
                    <th key={index}>{formatStopName(index)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.distanceMatrix.map((row, i) => (
                  <tr key={i}>
                    <td>{formatStopName(i)}</td>
                    {row.map((cell, j) => (
                      <td key={j}>{cell.distance} km</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Typography variant="h6" color="primary">
              Total traveling distance:
            </Typography>
            <Typography color="secondary">{card.distance}</Typography>
            <Typography variant="h6" color="primary">
              Time to complete route:
            </Typography>
            <Typography color="secondary">{card.time}</Typography>
            <GoButton
              component="a"
              href={card.link}
              onClick={handleDownloadJSON}
            >
              GO
            </GoButton>
          </CardItem>
        </Card>
      )}
    </Page>
  );
}

export default GoogleApiWrapper({
  apiKey: `${process.env.REACT_APP_GOOGLE_API_KEY}`,
})(MapScreen);

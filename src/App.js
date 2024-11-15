import React from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import { StylesProvider } from "@material-ui/styles";
import { ThemeProvider, createMuiTheme } from "@material-ui/core/styles";
import { color } from "./constants";
import Div100vh from "react-div-100vh";
import "typeface-rubik";
import TitleScreen from "./TitleScreen";
import MapScreen from "./MapScreen";
import withTransition from "./withTransition";

import { PoseGroup } from "react-pose";

const theme = createMuiTheme({
  typography: {
    fontFamily: "Rubik",
  },
  palette: {
    primary: {
      main: color.green,
      light: color.green1,
    },
    secondary: {
      main: color.red,
    },
  },
});

const PosedTitleScreen = withTransition(TitleScreen);
const PosedMapScreen = withTransition(MapScreen);

function App() {
  const [screen, setScreen] = React.useState(0);
  const [routeInfo, setRouteInfo] = React.useState(null);

  const nextScreen = (routeData) => {
    setRouteInfo(routeData);
    setScreen(1);
  };

  const screens = [
    <PosedTitleScreen key={0} onNext={nextScreen} />,
    <PosedMapScreen key={1} stops={routeInfo} />,
  ];

  return (
    <ThemeProvider theme={theme}>
      <StylesProvider injectFirst>
        <Div100vh>
          <PoseGroup preEnterPose="from" moveLeft>
            {screens[screen]}
          </PoseGroup>
        </Div100vh>
      </StylesProvider>
    </ThemeProvider>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));

export default App;

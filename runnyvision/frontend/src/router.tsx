import { createBrowserRouter } from "react-router-dom";
import RunnerPage from "./pages/RunnerPage";
import WorkaholPage from "./pages/WorkaholPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RunnerPage />,
  },
  {
    path: "/runner",
    element: <RunnerPage />,
  },
  {
    path: "/workahol",
    element: <WorkaholPage />,
  },
]);

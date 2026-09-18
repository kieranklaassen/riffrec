import { NextSessionLauncher } from "riffrec";

const noop = () => {};

export const Ready = () => (
  <NextSessionLauncher next={{ state: "ready", endpoint: "https://polish-7f3a.trycloudflare.com" }} onStart={noop} />
);

export const AgentWrappingUp = () => (
  <NextSessionLauncher next={{ state: "draining", endpoint: "https://polish-7f3a.trycloudflare.com" }} onStart={noop} />
);

export const LocalEndpoint = () => (
  <NextSessionLauncher next={{ state: "ready", endpoint: "http://127.0.0.1:4317" }} onStart={noop} />
);

// src/noop.tsx
function RiffrecProvider({ children }) {
  return children ?? null;
}
function useRiffrec() {
  return {
    start: async () => {
    },
    stop: async () => null,
    status: "disabled",
    isEnabled: false
  };
}
function RiffrecRecorder() {
  return null;
}
export {
  RiffrecProvider,
  RiffrecRecorder,
  useRiffrec
};
//# sourceMappingURL=index.node.js.map
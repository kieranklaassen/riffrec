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
function downloadSessionArchive(_filename, _archive) {
  throw new Error("Browser download APIs are not available.");
}
export {
  RiffrecProvider,
  RiffrecRecorder,
  downloadSessionArchive,
  useRiffrec
};
//# sourceMappingURL=index.node.js.map
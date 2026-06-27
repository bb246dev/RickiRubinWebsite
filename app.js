import("./server.mjs").catch((error) => {
  console.error("Ricki Rubin website failed to start", error);
  process.exit(1);
});

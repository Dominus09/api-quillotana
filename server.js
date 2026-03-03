app.get("/debug-variant", async (req, res) => {
  try {
    const variants = await getAll("variants");
    res.json(variants[0]); // solo el primero
  } catch (error) {
    res.status(500).json({ error: "Error debug" });
  }
});

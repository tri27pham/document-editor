import express from "express";
import cors from "cors";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// TODO: POST /documents
// TODO: GET /documents/:id

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

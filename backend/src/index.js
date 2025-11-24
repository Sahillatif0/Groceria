import { app } from "./app.js";
import { connectDb,  } from "./config/db.js";
import dotenv from "dotenv";
import { connectCloudinary } from "./utils/cdn.cloudinary.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

await connectCloudinary();
await connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.log("connection failed...", error);
  });

// app.use((req, res) => {
//   if (!isConnected) {
//     connectDb();
//   }
// });

export default app;

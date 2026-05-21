const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "http://localhost:3000",
        "https://pet-adoption-client-seven.vercel.app",
      ];
      
      if (!origin || allowedOrigins.includes(origin) || /https:\/\/pet-adoption-client.*\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWT verify middleware
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
  try {
    // await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

    const db = client.db("petAdoption");
    const petsCollection = db.collection("pets");
    const requestsCollection = db.collection("requests");

    // ──────────────────────────────────────
    // PETS ROUTES
    // ──────────────────────────────────────

    // GET all pets (search & filter)
    app.get("/pets", async (req, res) => {
      try {
        const { search, species } = req.query;
        let query = {};

        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        if (species && species !== "all") {
          query.species = { $in: [species] };
        }

        const result = await petsCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET featured pets
    app.get("/pets/featured", async (req, res) => {
      try {
        const result = await petsCollection.find().limit(6).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET pets by owner email
    app.get("/pets/owner/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const result = await petsCollection
          .find({ ownerEmail: email })
          .toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET single pet
    app.get("/pets/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await petsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!result) return res.status(404).json({ message: "Pet not found" });
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // POST add pet — protected
    app.post("/pets", verifyToken, async (req, res) => {
      try {
        const petData = req.body;
        
        // Validate required fields
        const requiredFields = ["name", "species", "breed", "age", "gender", "imageUrl", "healthStatus", "vaccinationStatus", "location", "adoptionFee", "description", "ownerEmail"];
        const missingFields = requiredFields.filter(field => !petData[field]);
        
        if (missingFields.length > 0) {
          return res.status(400).json({ message: `Missing fields: ${missingFields.join(", ")}` });
        }

        petData.status = "available";
        petData.createdAt = new Date();
        const result = await petsCollection.insertOne(petData);
        
        if (result.insertedId) {
          return res.json({ 
            acknowledged: result.acknowledged,
            insertedId: result.insertedId
          });
        } else {
          return res.status(500).json({ message: "Failed to insert pet" });
        }
      } catch (error) {
        console.error("Error adding pet:", error);
        res.status(500).json({ message: error.message || "Server error" });
      }
    });

    // PATCH update pet — protected
    app.patch("/pets/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;
        const result = await petsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // DELETE pet — protected
    app.delete("/pets/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await petsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ──────────────────────────────────────
    // REQUESTS ROUTES
    // ──────────────────────────────────────

    // GET requests by userId — protected
    app.get("/requests/user/:userId", verifyToken, async (req, res) => {
      try {
        const { userId } = req.params;
        const result = await requestsCollection
          .find({ userId })
          .toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET requests by petId — protected
    app.get("/requests/pet/:petId", verifyToken, async (req, res) => {
      try {
        const { petId } = req.params;
        const result = await requestsCollection
          .find({ petId })
          .toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // POST submit request — protected
    app.post("/requests", verifyToken, async (req, res) => {
      try {
        const requestData = req.body;
        requestData.status = "pending";
        requestData.createdAt = new Date();
        const result = await requestsCollection.insertOne(requestData);
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // PATCH approve request — protected
    app.patch("/requests/:id/approve", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { petId } = req.body;

        await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "approved" } }
        );

        await requestsCollection.updateMany(
          { petId, _id: { $ne: new ObjectId(id) } },
          { $set: { status: "rejected" } }
        );

        await petsCollection.updateOne(
          { _id: new ObjectId(petId) },
          { $set: { status: "adopted" } }
        );

        res.json({ message: "Request approved successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // PATCH reject request — protected
    app.patch("/requests/:id/reject", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // DELETE cancel request — protected
    app.delete("/requests/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await requestsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

app.get("/", (req, res) => {
  res.send("Pet Adoption Server is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS allowed origins: all pet-adoption-client Vercel URLs`);
});
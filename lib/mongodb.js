import { MongoClient } from "mongodb";

let clientPromise = null;

const DEFAULT_DB_NAME = "paste_logbook";
const DEFAULT_COLLECTION_NAME = "records";

function ensureClientPromise() {
  if (clientPromise) return clientPromise;

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }

    clientPromise = global._mongoClientPromise;
  } else {
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }

  return clientPromise;
}

export async function getDb() {
  const dbName = process.env.MONGODB_DB || DEFAULT_DB_NAME;
  const client = await ensureClientPromise();
  return client.db(dbName);
}

export async function getCollection(collectionName = process.env.MONGODB_COLLECTION || DEFAULT_COLLECTION_NAME) {
  const db = await getDb();
  return db.collection(collectionName);
}

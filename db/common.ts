import * as mongoDB from "mongodb"
import * as dotenv from "dotenv"

const defaultMongoDBUrl = "mongodb://localhost:27017/"
export class DBConnector {
  private static instance: mongoDB.Db

  private constructor() {}

  static async connectToDatabase(network: string): Promise<mongoDB.Db> {
    if (!DBConnector.instance) {
      dotenv.config()

      const client: mongoDB.MongoClient = new mongoDB.MongoClient(
        process.env.MONGODB_CONN ?? defaultMongoDBUrl
      )

      await client.connect()

      const db: mongoDB.Db = client.db(network)

      DBConnector.instance = db
    }
    return DBConnector.instance
  }
}

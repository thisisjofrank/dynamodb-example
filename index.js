import {
  json,
  serve,
  validateRequest,
} from "https://deno.land/x/sift@0.6.0/mod.ts";
// AWS has an official SDK that works with browsers. As most Deno Deploy's
// APIs are similar to browser's, the same SDK works with Deno Deploy.
// So we import the SDK along with some classes required to insert and
// retrieve data.
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "https://esm.sh/@aws-sdk/client-dynamodb";

// Create a client instance by providing your region information.
// The credentials are obtained from environment variables which
// we set during our project creation step on Deno Deploy.
const client = new DynamoDBClient({
  region: Deno.env.get("AWS_TABLE_REGION"),
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID"),
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY"),
  },
});

serve({
  "/songs": handleRequest,
});

async function handleRequest(request) {
  // The endpoint allows GET and POST request. A parameter named "title"
  // for a GET request to be processed. And body with the fields defined
  // below are required to process POST request.
  // validateRequest ensures that the provided terms are met by the request.
  const { error, body } = await validateRequest(request, {
    GET: {
      params: ["title"],
    },
    POST: {
      body: ["title", "artist", "album", "released", "genres"],
    },
  });
  if (error) {
    return json({ error: error.message }, { status: error.status });
  }

  // Handle POST request.
  if (request.method === "POST") {
    try {
      // When we want to interact with DynamoDB, we send a command using the client
      // instance. Here we are sending a PutItemCommand to insert the data from the
      // request.
      const {
        $metadata: { httpStatusCode },
      } = await client.send(
        new PutItemCommand({
          TableName: "songs",
          Item: {
            // Here 'S' implies that the value is of type string
            // and 'N' implies a number.
            title: { S: body.title },
            artist: { S: body.artist },
            album: { S: body.album },
            released: { N: body.released },
            genres: { S: body.genres },
          },
        }),
      );

      // On a successful put item request, dynamo returns a 200 status code (weird).
      // So we test status code to verify if the data has been inserted and respond
      // with the data provided by the request as a confirmation.
      if (httpStatusCode === 200) {
        return json({ ...body }, { status: 201 });
      }
    } catch (error) {
      // If something goes wrong while making the request, we log
      // the error for our reference.
      console.log(error);
    }

    // If the execution reaches here it implies that the insertion wasn't successful.
    return json({ error: "couldn't insert data" }, { status: 500 });
  }

  // Handle GET request.
  try {
    // We grab the title form the request and send a GetItemCommand
    // to retrieve the information about the song.
    const { searchParams } = new URL(request.url);
    const { Item } = await client.send(
      new GetItemCommand({
        TableName: "songs",
        Key: {
          title: { S: searchParams.get("title") },
        },
      }),
    );

    // The Item property contains all the data, so if it's not undefined,
    // we proceed to returning the information about the title
    if (Item) {
      return json({
        title: Item.title.S,
        artist: Item.artist.S,
        album: Item.album.S,
        released: Item.released.S,
        genres: Item.genres.S,
      });
    }
  } catch (error) {
    console.log(error);
  }

  // We might reach here if an error is thrown during the request to database
  // or if the Item is not found in the database.
  // We reflect both conditions with a general message.
  return json(
    {
      message: "couldn't find the title",
    },
    { status: 404 },
  );
}

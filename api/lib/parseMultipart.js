import Busboy from "busboy";

export function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const files = [];

    const busboy = Busboy({ headers: req.headers });

    busboy.on("file", (_fieldname, stream, info) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        files.push({
          originalname: info.filename,
          buffer: Buffer.concat(chunks),
        });
      });
      stream.on("error", reject);
    });

    busboy.on("finish", () => resolve(files));
    busboy.on("error", reject);

    req.pipe(busboy);
  });
}

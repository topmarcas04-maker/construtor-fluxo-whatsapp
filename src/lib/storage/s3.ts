/**
 * Armazenamento de arquivos grandes (vídeos) num bucket compatível com S3
 * (Railway Storage Buckets, Cloudflare R2, AWS S3...). Sem imports "@/": usado pelo site e pelo motor.
 *
 * Variáveis (as mesmas que o Railway cria para o bucket; com prefixo S3_ também funciona):
 *   BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, REGION
 *   S3_FORCE_PATH_STYLE=1 para buckets antigos que pedem path-style
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function env(name: string) {
  return process.env[`S3_${name}`] || process.env[name] || "";
}

export function storageConfig() {
  return {
    bucket: env("BUCKET"),
    accessKeyId: env("ACCESS_KEY_ID"),
    secretAccessKey: env("SECRET_ACCESS_KEY"),
    endpoint: env("ENDPOINT"),
    region: env("REGION") || "auto",
    pathStyle: env("FORCE_PATH_STYLE") === "1" || env("FORCE_PATH_STYLE") === "true",
  };
}

/** O bucket está configurado? */
export function storageReady() {
  const c = storageConfig();
  return Boolean(c.bucket && c.accessKeyId && c.secretAccessKey && c.endpoint);
}

let client: S3Client | null = null;
function s3() {
  if (!client) {
    const c = storageConfig();
    client = new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      forcePathStyle: c.pathStyle,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
  }
  return client;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: storageConfig().bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<Buffer> {
  const r = await s3().send(new GetObjectCommand({ Bucket: storageConfig().bucket, Key: key }));
  const bytes = await r.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string) {
  await s3()
    .send(new DeleteObjectCommand({ Bucket: storageConfig().bucket, Key: key }))
    .catch(() => {});
}

/** Link temporário para abrir o arquivo (painel, Instagram/Messenger) */
export async function signedUrl(key: string, seconds = 3600) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: storageConfig().bucket, Key: key }), { expiresIn: seconds });
}

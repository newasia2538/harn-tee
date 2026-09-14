import { env } from "cloudflare:workers";
import {
  createOpaqueToken,
  hashToken,
  tokensMatch,
} from "../lib/harn-tee/tokens";
import type {
  BillDocument,
  BillDraft,
  BillPatch,
  BillRecord,
  QrPayment,
} from "../lib/harn-tee/types";
import { applyBillPatch, buildBillDocument } from "./document";

type StoredBillRow = {
  id: string;
  share_token_digest: string;
  edit_token_digest: string;
  payload_json: string;
  created_at: number;
  updated_at: number;
};

function database() {
  if (!env.DB) {
    throw new Error("D1 binding DB is unavailable");
  }
  return env.DB;
}

function rowToDocument(row: StoredBillRow): BillDocument {
  return JSON.parse(row.payload_json) as BillDocument;
}

async function findByToken(kind: "share" | "edit", rawToken: string) {
  const digest = await hashToken(rawToken);
  const column =
    kind === "share" ? "share_token_digest" : "edit_token_digest";
  const row = await database()
    .prepare(
      "SELECT id, share_token_digest, edit_token_digest, payload_json, created_at, updated_at FROM bills WHERE " +
        column +
        " = ?1 LIMIT 1",
    )
    .bind(digest)
    .first<StoredBillRow>();

  if (!row || !(await tokensMatch(rawToken, row[column]))) return null;
  return { row, document: rowToDocument(row) };
}

export async function createBillRecord(
  draft: BillDraft,
  status: "draft" | "published" = "draft",
) {
  const id = crypto.randomUUID();
  const shareToken = createOpaqueToken();
  const editToken = createOpaqueToken();
  const document = buildBillDocument(draft, Date.now(), status);

  await database()
    .prepare(
      "INSERT INTO bills (id, share_token_digest, edit_token_digest, payload_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(
      id,
      await hashToken(shareToken),
      await hashToken(editToken),
      JSON.stringify(document),
      document.createdAt,
      document.updatedAt,
    )
    .run();

  return { id, shareToken, editToken, document };
}

export async function readBillByToken(
  kind: "share" | "edit",
  rawToken: string,
): Promise<BillRecord | null> {
  const found = await findByToken(kind, rawToken);
  if (
    !found ||
    found.document.status === "deleted" ||
    (kind === "share" && found.document.status !== "published")
  ) return null;
  return {
    id: found.row.id,
    document: found.document,
    access: kind,
  };
}

export async function updateBillByEditToken(
  rawToken: string,
  patch: BillPatch,
) {
  const found = await findByToken("edit", rawToken);
  if (!found || found.document.status === "deleted") return null;
  const document = applyBillPatch(found.document, patch);

  await database()
    .prepare("UPDATE bills SET payload_json = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(JSON.stringify(document), document.updatedAt, found.row.id)
    .run();

  return document;
}

export async function setParticipantPaid(
  rawToken: string,
  participantId: string,
  paid: boolean,
) {
  const access = await readBillByToken("share", rawToken);
  const editAccess = access ?? (await readBillByToken("edit", rawToken));
  if (!editAccess) return null;
  const document: BillDocument = {
    ...editAccess.document,
    participants: editAccess.document.participants.map((person) =>
      person.id === participantId
        ? { ...person, paid, paidAt: paid ? Date.now() : null }
        : person,
    ),
    updatedAt: Date.now(),
  };

  await database()
    .prepare("UPDATE bills SET payload_json = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(JSON.stringify(document), document.updatedAt, editAccess.id)
    .run();

  return document;
}

export async function deleteBillByEditToken(rawToken: string) {
  const found = await findByToken("edit", rawToken);
  if (!found) return false;
  const document = {
    ...found.document,
    status: "deleted" as const,
    updatedAt: Date.now(),
  };
  await database()
    .prepare("UPDATE bills SET payload_json = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(JSON.stringify(document), document.updatedAt, found.row.id)
    .run();
  return true;
}

export async function saveQrForEditToken(
  rawToken: string,
  file: File,
): Promise<BillDocument | null> {
  const found = await findByToken("edit", rawToken);
  if (!found || found.document.status === "deleted" || !env.BUCKET) return null;

  const extension = file.type.split("/")[1] ?? "png";
  const objectKey = "bills/" + found.row.id + "/" + crypto.randomUUID() + "." + extension;
  await env.BUCKET.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const previousKey = found.document.recipient.qr?.objectKey;
  if (previousKey) await env.BUCKET.delete(previousKey);

  const qr: QrPayment = {
    objectKey,
    contentType: file.type,
    size: file.size,
  };
  const document: BillDocument = {
    ...found.document,
    recipient: { ...found.document.recipient, qr },
    updatedAt: Date.now(),
  };

  await database()
    .prepare("UPDATE bills SET payload_json = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(JSON.stringify(document), document.updatedAt, found.row.id)
    .run();

  return document;
}

export async function readQrByToken(rawToken: string) {
  const access = await readBillByToken("share", rawToken);
  const editAccess = access ?? (await readBillByToken("edit", rawToken));
  if (!editAccess || !env.BUCKET) return null;
  const objectKey = editAccess.document.recipient.qr?.objectKey;
  if (!objectKey) return null;
  return env.BUCKET.get(objectKey);
}

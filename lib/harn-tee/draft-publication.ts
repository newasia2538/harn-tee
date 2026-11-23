import {DraftApiError,type DraftApi} from "./draft-api";
import {DraftStorageError} from "./draft-store";
import {validateFormForPublication,type RemoteIdentity} from "./draft-state";
import type {SubmissionContext} from "./use-draft-session";
import {recoveredQrUpload} from "./draft-ack";
export class RecoveryCopyRequiredError extends Error{
  readonly code="recovery-copy-required";
  constructor(public remote:RemoteIdentity){super("recovery-copy-required");}
}
export async function confirmDraftPublication(context:SubmissionContext,io:{api:DraftApi;rememberRemote(remote:RemoteIdentity):Promise<void>},options:{recoveryCopyAcknowledged?:boolean}={}){
  const {api}=io;let remote={...context.remote};
  let copiedShare=options.recoveryCopyAcknowledged?remote.shareToken:undefined;
  const result=(ack:Awaited<ReturnType<DraftApi["load"]>>)=>({remote:{...remote,revision:ack.revision,status:"published" as const},document:ack.document});
  const latest=await api.load(remote.editToken);
  if(latest.document.status==="published"&&latest.lastConfirmationId===context.confirmationId)return result(latest);
  if(latest.revision!==remote.revision||latest.document.status!==remote.status)throw new DraftApiError(409,"revision-conflict");
  const validation=validateFormForPublication(context.form,context.qr.kind!=="none");
  if(!validation.valid)throw new Error(validation.errors[0]);
  async function remember(){
    try{await io.rememberRemote(remote);}catch(error){
      if(error instanceof DraftStorageError&&error.code==="storage-conflict")throw error;
      if(!options.recoveryCopyAcknowledged||remote.status==="draft"&&(!remote.shareToken||copiedShare!==remote.shareToken))throw new RecoveryCopyRequiredError(remote);
    }
  }
  if(context.qr.kind==="local"&&context.qr.selectionId!==remote.qrSelectionId){
    let ack;
    try{ack=await api.uploadQr(remote.editToken,remote.revision,context.qr.file,remote.status==="draft"?"draft":"confirm",undefined,context.qr.selectionId);}catch(error){
      if(!(error instanceof DraftApiError&&error.status===0))throw error;
      const recovered=await api.load(remote.editToken);if(!recoveredQrUpload(latest,recovered,context.qr.selectionId))throw new DraftApiError(409,"revision-conflict");ack=recovered;
    }
    remote={...remote,revision:ack.revision,qrSelectionId:context.qr.selectionId};await remember();
  }
  async function issue(){
    const capability=await api.issueShare(remote.editToken,remote.revision);
    remote={...remote,...capability};copiedShare=undefined;await remember();
  }
  if(remote.status==="draft"&&!remote.shareToken)await issue();else await remember();
  const publish=()=>api.publish(remote.editToken,remote.revision,context.form,context.confirmationId,remote.shareToken);
  try{return result(await publish());}catch(error){
    if(error instanceof DraftApiError&&error.code==="share-proof-stale"&&remote.status==="draft"){
      const current=await api.load(remote.editToken);
      if(current.revision!==remote.revision||current.document.status!=="draft")throw new DraftApiError(409,"revision-conflict");
      await issue();return result(await publish());
    }
    // An explicit update can have uploaded a QR before its body failed. Reconcile
    // the current revision; the caller retains the local form and selection marker.
    try{
      const current=await api.load(remote.editToken);
      if(current.document.status==="published"&&current.lastConfirmationId===context.confirmationId)return result(current);
      if(current.revision!==remote.revision)throw new DraftApiError(409,"revision-conflict");
    }catch(recoveryError){if(recoveryError instanceof DraftApiError&&recoveryError.status===409)throw recoveryError;}
    throw error;
  }
}

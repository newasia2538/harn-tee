import {describe,expect,it,vi} from "vitest";
import {confirmDraftPublication,RecoveryCopyRequiredError} from "../../lib/harn-tee/draft-publication";
import type {SubmissionContext} from "../../lib/harn-tee/use-draft-session";
import {draftFixture} from "../helpers/draft-fixtures";
import {sessionFixtures} from "../helpers/draft-session-fixtures";
import {DraftApiError} from "../../lib/harn-tee/draft-api";
function fixture(){const fx=sessionFixtures(),rememberRemote=vi.fn(async()=>undefined);const context:SubmissionContext={form:draftFixture(),remote:{id:"b1",editToken:"edit",shareToken:"share",revision:fx.ack.revision,status:"draft"},qr:{kind:"none"},confirmationId:"confirm",generation:"g",localId:"local",localVersion:1};return {fx,context,io:{api:fx.api,rememberRemote},rememberRemote};}
describe("explicit publication orchestration",()=>{
 it("passes a live national ID only to the explicit publication body",async()=>{
  const {fx,context,io,rememberRemote}=fixture();context.form.draft.recipient!.promptPay={type:"national-id",value:"1101700203450"};
  await confirmDraftPublication(context,io);
  expect(vi.mocked(fx.api.publish).mock.calls[0][2].draft.recipient?.promptPay?.value).toBe("1101700203450");
  expect(JSON.stringify(rememberRemote.mock.calls)).not.toContain("1101700203450");expect(fx.api.save).not.toHaveBeenCalled();
 });
 it("uploads QR before publishing with the returned revision and retains its identity",async()=>{
  const {fx,context,io,rememberRemote}=fixture();context.qr={kind:"local",selectionId:"qr1",file:new File(["qr"],"qr.png",{type:"image/png"})};
  const result=await confirmDraftPublication(context,io);expect(result.document.status).toBe("published");expect(fx.api.uploadQr).toHaveBeenCalledTimes(1);expect(rememberRemote).toHaveBeenCalledWith(expect.objectContaining({qrSelectionId:"qr1"}));
  expect(vi.mocked(fx.api.publish).mock.calls[0][1]).not.toBe("r0");
 });
 it("does not publish when its selected QR fails",async()=>{
  const {fx,context,io}=fixture();context.qr={kind:"local",selectionId:"qr1",file:new File(["qr"],"qr.png",{type:"image/png"})};vi.mocked(fx.api.uploadQr).mockRejectedValue(new Error("upload failed"));
  await expect(confirmDraftPublication(context,io)).rejects.toThrow("upload failed");expect(fx.api.publish).not.toHaveBeenCalled();
 });
 it("issues and durably remembers a missing share capability before publication",async()=>{
  const {fx,context,io,rememberRemote}=fixture();delete context.remote.shareToken;
  await confirmDraftPublication(context,io);expect(fx.api.issueShare).toHaveBeenCalledOnce();expect(rememberRemote.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fx.api.publish).mock.invocationCallOrder[0]);
 });
 it("recovers its own lost response without resending or validating a now missing ID",async()=>{
  const {fx,context,io}=fixture();fx.setAck({...fx.ack,document:{...fx.ack.document,status:"published"},lastConfirmationId:"confirm",revision:"new"});context.form.draft.recipient!.promptPay={type:"national-id",value:""};
  const result=await confirmDraftPublication(context,io);expect(result.remote.revision).toBe("new");expect(fx.api.publish).not.toHaveBeenCalled();
 });
 it("reconciles an uncertain publish response with its confirmation marker",async()=>{
  const {fx,context,io}=fixture();vi.mocked(fx.api.publish).mockImplementation(async()=>{fx.setAck({...fx.ack,document:{...fx.ack.document,status:"published"},lastConfirmationId:"confirm",revision:"new"});throw new DraftApiError(0,"network");});
  expect((await confirmDraftPublication(context,io)).document.status).toBe("published");expect(fx.api.publish).toHaveBeenCalledOnce();
 });
 it("preserves input and blocks when another confirmation or revision won",async()=>{
  const {fx,context,io}=fixture();fx.setAck({...fx.ack,revision:"other"});
  await expect(confirmDraftPublication(context,io)).rejects.toMatchObject({code:"revision-conflict"});expect(fx.api.publish).not.toHaveBeenCalled();
 });
 it("requires copying exact recovery links when storage fails",async()=>{
  const {fx,context,io,rememberRemote}=fixture();rememberRemote.mockRejectedValue(new Error("quota"));
  await expect(confirmDraftPublication(context,io)).rejects.toBeInstanceOf(RecoveryCopyRequiredError);expect(fx.api.publish).not.toHaveBeenCalled();
  await confirmDraftPublication(context,io,{recoveryCopyAcknowledged:true});expect(fx.api.publish).toHaveBeenCalledOnce();
 });
 it("resets the copy acknowledgment when a stale share capability is replaced",async()=>{
  const {fx,context,io,rememberRemote}=fixture();vi.mocked(fx.api.publish).mockRejectedValue(new DraftApiError(409,"share-proof-stale"));vi.mocked(fx.api.issueShare).mockResolvedValue({shareToken:"replacement",revision:"r0"});rememberRemote.mockRejectedValue(new Error("quota"));
  await expect(confirmDraftPublication(context,io,{recoveryCopyAcknowledged:true})).rejects.toBeInstanceOf(RecoveryCopyRequiredError);expect(fx.api.publish).toHaveBeenCalledOnce();
 });
 it("never rotates a published bill link",async()=>{
  const {fx,context,io}=fixture();context.remote.status="published";delete context.remote.shareToken;fx.setAck({...fx.ack,document:{...fx.ack.document,status:"published"}});
  await confirmDraftPublication(context,io);expect(fx.api.issueShare).not.toHaveBeenCalled();expect(fx.api.uploadQr).not.toHaveBeenCalled();
 });
});
it("does_not_copy_extra_share_ack_payload_into_remote_identity",async()=>{
 const {fx,context,io,rememberRemote}=fixture();delete context.remote.shareToken;vi.mocked(fx.api.issueShare).mockResolvedValue({shareToken:"share",revision:fx.ack.revision,lifecycle:fx.ack.lifecycle,serverNow:100});
 await confirmDraftPublication(context,io);for(const [remote] of rememberRemote.mock.calls as unknown as [Record<string,unknown>][])expect(remote).not.toHaveProperty("serverNow");
});

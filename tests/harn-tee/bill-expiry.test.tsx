// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,render,screen} from "@testing-library/react";
import {BillExpiry} from "../../components/harn-tee/bill-expiry";
import {createRetentionClock} from "../../lib/harn-tee/retention-clock";
afterEach(()=>{cleanup();vi.useRealTimers();});
it("switches_days_to_local_countdown_and_stops_at_zero_without_live_announcements",()=>{
 vi.useFakeTimers();const clock=createRetentionClock(()=>Date.now());clock.sync(1000);const {container}=render(<BillExpiry expiresAt={86401000} serverClock={clock} syncState="synced" deadlineSource="server"/>);
 expect(screen.getByText("เหลือ 1 วัน")).toBeTruthy();act(()=>vi.advanceTimersByTime(1000));expect(screen.getByText("23:59:59")).toBeTruthy();act(()=>vi.advanceTimersByTime(86399000));expect(screen.getByText("กำลังตรวจสอบวันหมดอายุ")).toBeTruthy();expect(container.querySelector('[aria-live="polite"],[role="status"]')).toBeNull();
});
it("uses_honest_offline_and_unsynchronized_labels",()=>{
 const clock=createRetentionClock(()=>0);const {rerender}=render(<BillExpiry expiresAt={0} serverClock={clock} syncState="offline" deadlineSource="server"/>);expect(screen.getByText("รอตรวจสอบเมื่อเชื่อมต่อ")).toBeTruthy();rerender(<BillExpiry expiresAt={0} serverClock={clock} syncState="pending" deadlineSource="server"/>);expect(screen.getByText("กำลังตรวจสอบวันหมดอายุ")).toBeTruthy();
});

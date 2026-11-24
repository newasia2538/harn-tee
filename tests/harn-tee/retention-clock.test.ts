import {describe,expect,it} from "vitest";
import {createRetentionClock,remainingBillTime} from "../../lib/harn-tee/retention-clock";
describe("retention clock",()=>{
  it("clock_uses_elapsed_time_after_sleep",()=>{
    let tick=0;const clock=createRetentionClock(()=>tick);expect(clock.now()).toBeNull();clock.sync(1000);
    tick=7200000;expect(clock.now()).toBe(7201000);
    tick+=1000;expect(clock.now()).toBe(7202000);
  });
  it("late_server_time_cannot_move_the_clock_backwards",()=>{
    let tick=0;const clock=createRetentionClock(()=>tick);clock.sync(1000);tick=2000;clock.sync(1500);expect(clock.now()).toBe(3000);
    tick=3000;expect(clock.now()).toBe(4000);
    clock.sync(9000);expect(clock.now()).toBe(9000);
  });
  it("countdown_boundary_is_exact",()=>{
    expect(remainingBillTime(86400001,0)).toEqual({kind:"days",days:2});
    expect(remainingBillTime(86400000,0)).toEqual({kind:"days",days:1});
    expect(remainingBillTime(86399999,0)).toEqual({kind:"countdown",text:"23:59:59"});
    expect(remainingBillTime(3601000,0)).toEqual({kind:"countdown",text:"01:00:01"});
    expect(remainingBillTime(1,1)).toEqual({kind:"expired"});
    expect(remainingBillTime(1,999)).toEqual({kind:"expired"});
  });
});

// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,render,screen} from "@testing-library/react";
import {useRef} from "react";
import {useBottomBarLayout} from "../../lib/harn-tee/use-bottom-bar-layout";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function Probe({active=true}:{active?:boolean}){
  const ref=useRef<HTMLElement>(null),layout=useBottomBarLayout(ref,active);
  return <section ref={ref}><output>{layout.height}:{layout.bottomInset}</output></section>;
}
it("measures_expanded_height_and_cleans_up",()=>{
  let height=72,resize:()=>void=()=>undefined;
  const disconnect=vi.fn();
  vi.stubGlobal("ResizeObserver",class{constructor(callback:()=>void){resize=callback;}observe(){}disconnect=disconnect;});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(()=>({height} as DOMRect));
  const {unmount}=render(<Probe/>);expect(screen.getByRole("status").textContent).toBe("72:0");
  height=190;act(()=>resize());expect(screen.getByRole("status").textContent).toBe("190:0");
  unmount();expect(disconnect).toHaveBeenCalledOnce();
});
it("tracks_keyboard_inset_and_resets_on_exit",()=>{
  const viewport=Object.assign(new EventTarget(),{height:500,offsetTop:20});
  vi.stubGlobal("visualViewport",viewport);vi.stubGlobal("innerHeight",800);
  const {rerender,unmount}=render(<Probe/>);
  expect(screen.getByRole("status").textContent).toBe("84:280");
  viewport.height=800;viewport.offsetTop=0;act(()=>viewport.dispatchEvent(new Event("resize")));
  expect(screen.getByRole("status").textContent).toBe("84:0");
  rerender(<Probe active={false}/>);expect(screen.getByRole("status").textContent).toBe("0:0");
  unmount();act(()=>viewport.dispatchEvent(new Event("scroll")));
});

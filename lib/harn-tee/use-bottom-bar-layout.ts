"use client";
import {useLayoutEffect,useState,type RefObject} from "react";

/** Measure real content, including disclosure/notices and safe-area padding. */
export function useBottomBarLayout(ref:RefObject<HTMLElement|null>,active:boolean):{height:number;bottomInset:number}{
  const [layout,setLayout]=useState({height:84,bottomInset:0});
  useLayoutEffect(()=>{
    if(!active)return;
    const viewport=window.visualViewport;
    const measure=()=>{
      const measured=ref.current?.getBoundingClientRect().height??0;
      const bottomInset=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
      setLayout(previous=>{
        const height=measured>0?Math.ceil(measured):previous.height;
        return height===previous.height&&bottomInset===previous.bottomInset?previous:{height,bottomInset};
      });
    };
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(measure):undefined;
    if(ref.current)observer?.observe(ref.current);
    measure();window.addEventListener("resize",measure);
    viewport?.addEventListener("resize",measure);viewport?.addEventListener("scroll",measure);
    return ()=>{observer?.disconnect();window.removeEventListener("resize",measure);viewport?.removeEventListener("resize",measure);viewport?.removeEventListener("scroll",measure);};
  },[active,ref]);
  return active?layout:{height:0,bottomInset:0};
}

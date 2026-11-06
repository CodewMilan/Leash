"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, useGSAP);

CustomEase.create("leashInOut", ".87,0,.13,1");
CustomEase.create("leashOut", ".22,1,.36,1");
CustomEase.create("leashSpring", ".34,1.3,.64,1");
CustomEase.create("leashFlip", ".34,.9,.36,1");

export const EASE = {
  inOut: "leashInOut",
  out: "leashOut",
  spring: "leashSpring",
  flip: "leashFlip",
} as const;

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches;
}

export { gsap, ScrollTrigger, SplitText, useGSAP };

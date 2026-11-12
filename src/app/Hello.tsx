/**
 * The opening: an 8-second intro video (public/intro/hello.mp4) plays full screen, then dissolves
 * while the app settles into place underneath. Once per launch; a click or any key skips it;
 * Settings can turn it off.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../data/store";
import "./hello.css";

const SEEN = "daiku.hello.seen";
const FADE = 1100;
const INTRO_SRC = "/intro/hello.mp4";

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN, "1");
  } catch {
    // Not remembered; it will just play again next time the page loads.
  }
}

export function Hello() {
  const off = useStore((s) => s.config.greeting_intro === "off" || s.config.motion === "off");
  // Automated browsers (tests) skip it: they'd otherwise click on the intro instead of the app.
  const [show] = useState(() => !alreadySeen() && !navigator.webdriver);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const leavingRef = useRef(false);

  const finish = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    markSeen();
    // The app settles in underneath as the intro lifts away (see .shell in hello.css).
    document.documentElement.dataset.hello = "reveal";
    setTimeout(() => {
      setGone(true);
      delete document.documentElement.dataset.hello;
    }, FADE + 200);
  };

  // While the intro plays, the app waits underneath, slightly back, ready to settle forward.
  useEffect(() => {
    if (!show || off) return;
    document.documentElement.dataset.hello = "playing";
    return () => {
      if (document.documentElement.dataset.hello === "playing") delete document.documentElement.dataset.hello;
    };
  }, [show, off]);

  // Any key skips straight to the app.
  useEffect(() => {
    if (!show || off || gone) return;
    const skip = () => finish();
    window.addEventListener("keydown", skip, { once: true });
    return () => window.removeEventListener("keydown", skip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, off, gone]);

  if (!show || off || gone) return null;

  return createPortal(
    <div className={`hello ${leaving ? "leaving" : ""}`} role="presentation" onPointerDown={finish}>
      <video
        className="hello-video"
        src={INTRO_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        // Start dissolving just before the last frame, so the hand-off is seamless.
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration && v.duration - v.currentTime < FADE / 1000 / 2) finish();
        }}
        onEnded={finish}
        onError={finish}
      />
      <span className="hello-skip">Click or press any key to skip</span>
    </div>,
    document.body,
  );
}

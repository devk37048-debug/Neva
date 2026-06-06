import { useEffect, useRef } from "react";
import { motion } from "motion/react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking";

interface VisualizerProps {
  state: VisualizerState;
}

interface Particle {
  x: number; // 3D X coordinate
  y: number; // 3D Y coordinate
  z: number; // 3D Z coordinate
  baseX: number; // original relative position
  baseY: number;
  baseZ: number;
  r: number; // dot size
  color: string;
  glow: string;
  twinklePhase: number;
  twinkleSpeed: number;
  verticalHemisphere: "top" | "bottom";
}

export default function Visualizer({ state }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<VisualizerState>(state);

  // Sync state to ref to avoid re-initializing particles on state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const sphereRadius = 75;
    const particleCount = 750;

    // Set high pixel density
    const dpr = window.devicePixelRatio || 1;
    const baseWidth = 260;
    const baseHeight = 260;
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = `${baseWidth}px`;
    canvas.style.height = `${baseHeight}px`;
    ctx.scale(dpr, dpr);

    // Initialize particles uniformly in a 3D sphere
    for (let i = 0; i < particleCount; i++) {
      // Golden spiral distribution / Fibonacci sphere for beautiful regular spacing with random noise
      const phi = Math.acos(1 - (2 * i) / particleCount);
      const theta = Math.sqrt(particleCount * Math.PI) * phi + (Math.random() - 0.5) * 0.2;

      // Add slight spatial noise to give that organic "stardust" feel seen in the user's screenshot
      const radiusOffset = (Math.random() - 0.5) * 16;
      const currentRadius = sphereRadius + radiusOffset;

      const x = currentRadius * Math.sin(phi) * Math.cos(theta);
      const y = currentRadius * Math.cos(phi); // Y axis points UP
      const z = currentRadius * Math.sin(phi) * Math.sin(theta);

      // Top hemisphere gets gold/amber, bottom half gets silver/white
      const isTop = y > (Math.random() - 0.5) * 10; // smooth bleeding edge transition

      let color = "";
      let glow = "";
      if (isTop) {
        // High luxury gold/amber color palette matching image
        const goldTones = [
          "rgba(245, 158, 11, ",  // amber-500
          "rgba(251, 191, 36, ",  // amber-400
          "rgba(252, 211, 77, ",  // amber-300
          "rgba(234, 88, 12, ",   // orange-600 (gives deep ember contrast)
          "rgba(254, 240, 138, "  // yellow-100 (for high sparks)
        ];
        color = goldTones[Math.floor(Math.random() * goldTones.length)];
        glow = "rgba(245, 158, 11, 0.4)";
      } else {
        // Pure starlight silver/white color palette matching image
        const silverTones = [
          "rgba(248, 250, 252, ", // slate-50
          "rgba(226, 232, 240, ", // slate-200
          "rgba(203, 213, 225, ", // slate-300
          "rgba(241, 245, 249, ", // slate-100
          "rgba(186, 230, 253, "  // sky-200 (subtle cooling silver)
        ];
        color = silverTones[Math.floor(Math.random() * silverTones.length)];
        glow = "rgba(226, 232, 240, 0.35)";
      }

      particles.push({
        x,
        y,
        z,
        baseX: x,
        baseY: y,
        baseZ: z,
        r: Math.random() * 1.5 + 0.6,
        color,
        glow,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.04 + 0.02,
        verticalHemisphere: isTop ? "top" : "bottom",
      });
    }

    let angleX = 0.003;
    let angleY = 0.005;
    let time = 0;

    const render = () => {
      time += 0.03;
      const currentState = stateRef.current;

      ctx.clearRect(0, 0, baseWidth, baseHeight);

      // Adjust physics/rotation speeds & pulsations based on state
      let rotationSpeedMultiplier = 1.0;
      let breathingFactor = 1.0;
      let particleSpread = 0.0;
      let turbulence = 0.0;

      if (currentState === "listening") {
        rotationSpeedMultiplier = 2.4;
        breathingFactor = 1.0 + Math.sin(time * 3) * 0.08;
        particleSpread = 12 * Math.sin(time * 2);
      } else if (currentState === "processing") {
        rotationSpeedMultiplier = 4.0;
        breathingFactor = 0.9 + Math.sin(time * 6) * 0.04;
        turbulence = 6;
      } else if (currentState === "speaking") {
        rotationSpeedMultiplier = 1.6;
        breathingFactor = 1.0 + Math.abs(Math.sin(time * 4)) * 0.15;
        particleSpread = 18 * Math.abs(Math.sin(time * 5.5));
      } else { // idle
        rotationSpeedMultiplier = 1.0;
        breathingFactor = 1.0 + Math.sin(time * 0.6) * 0.03; // generic calm breathing
      }

      // 1. Draw volumetric backdrop glows behind particles
      const goldGrad = ctx.createRadialGradient(baseWidth / 2, baseHeight / 2 - 12, 5, baseWidth / 2, baseHeight / 2 - 20, 75);
      const goldAlpha = currentState === "speaking" ? 0.28 : currentState === "listening" ? 0.22 : 0.14;
      goldGrad.addColorStop(0, `rgba(245, 158, 11, ${goldAlpha})`);
      goldGrad.addColorStop(0.5, "rgba(234, 88, 12, 0.04)");
      goldGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = goldGrad;
      ctx.beginPath();
      ctx.arc(baseWidth / 2, baseHeight / 2 - 8, 100, 0, Math.PI, true); // upper half glow
      ctx.fill();

      const silverGrad = ctx.createRadialGradient(baseWidth / 2, baseHeight / 2 + 12, 5, baseWidth / 2, baseHeight / 2 + 20, 75);
      const silverAlpha = currentState === "speaking" ? 0.22 : currentState === "listening" ? 0.18 : 0.12;
      silverGrad.addColorStop(0, `rgba(226, 232, 240, ${silverAlpha})`);
      silverGrad.addColorStop(0.5, "rgba(100, 116, 139, 0.03)");
      silverGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = silverGrad;
      ctx.beginPath();
      ctx.arc(baseWidth / 2, baseHeight / 2 + 8, 100, 0, Math.PI, false); // lower half glow
      ctx.fill();

      // 2. Project, rotate & render particles
      const cosX = Math.cos(angleX * rotationSpeedMultiplier);
      const sinX = Math.sin(angleX * rotationSpeedMultiplier);
      const cosY = Math.cos(angleY * rotationSpeedMultiplier);
      const sinY = Math.sin(angleY * rotationSpeedMultiplier);

      // Sort particles by their projected dynamic Z-depth for perfect 3D occlusion layering
      const mappedParticles = particles.map((p) => {
        // Adjust radial factor for breathing and dynamic sound wave spreads
        const stateRadiusFactor = breathingFactor + (particleSpread / sphereRadius);
        
        let tempX = p.baseX * stateRadiusFactor;
        let tempY = p.baseY * stateRadiusFactor;
        let tempZ = p.baseZ * stateRadiusFactor;

        // Apply chaos turbulence on active states of processing
        if (turbulence > 0) {
          const turbVal = Math.sin(time * 5 + p.baseY * 0.05) * turbulence;
          tempX += turbVal;
          tempZ += turbVal;
        }

        // Rotate about X axis
        let y1 = tempY * cosX - tempZ * sinX;
        let z1 = tempZ * cosX + tempY * sinX;

        // Rotate about Y axis
        let x2 = tempX * cosY - z1 * sinY;
        let z2 = z1 * cosY + tempX * sinY;

        return {
          projX: x2 + baseWidth / 2,
          projY: y1 + baseHeight / 2,
          projZ: z2,
          particle: p
        };
      });

      // Render backing particles first, then foreground
      mappedParticles.sort((a, b) => a.projZ - b.projZ);

      mappedParticles.forEach(({ projX, projY, projZ, particle: p }) => {
        p.twinklePhase += p.twinkleSpeed;
        
        // Depth scale (Closer z -> larger size)
        const scale = (projZ + sphereRadius * 1.5) / (sphereRadius * 3);
        const radius = Math.max(0.3, p.r * (0.4 + scale * 0.9));

        // Twinkle luminance calculation
        const baseAlpha = 0.4 + scale * 0.55;
        const twinkleFactor = Math.sin(p.twinklePhase);
        let alpha = baseAlpha * (0.65 + twinkleFactor * 0.35);

        // Boost spark highlights if speaking/processing
        if (currentState === "speaking" && p.verticalHemisphere === "top" && Math.random() > 0.985) {
          alpha = 1.0;
        }

        // Draw particle drop shadows for that extra volumetric flare
        if (scale > 0.6) {
          ctx.shadowBlur = 4;
          ctx.shadowColor = p.glow;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = `${p.color}${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(projX, projY, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.shadowBlur = 0; // reset shadow state

      // 3. Draw a gorgeous central lens flare / core overlay reflecting light
      const coreGrad = ctx.createRadialGradient(baseWidth / 2, baseHeight / 2, 3, baseWidth / 2, baseHeight / 2, 30);
      const coreAlpha = currentState === "speaking" ? 0.32 : currentState === "processing" ? 0.45 : 0.18;
      coreGrad.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha})`);
      coreGrad.addColorStop(0.3, `rgba(253, 186, 116, ${coreAlpha * 0.4})`);
      coreGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(baseWidth / 2, baseHeight / 2, 35, 0, Math.PI * 2);
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-[240px] h-[240px] md:w-[280px] md:h-[280px] flex items-center justify-center">
      {/* Background Subtle Pulsing Core Glow Map */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500/10 to-slate-200/5 blur-[90px] animate-pulse" />

      {/* Golden/Silver shimmering particle Canvas */}
      <canvas ref={canvasRef} className="z-10 block" />

      {/* Centered high-tech HUD visualizer line mapping */}
      <div className="absolute z-20 flex flex-col items-center justify-center pointer-events-none">
        <motion.div
          animate={{
            opacity: state === "speaking" ? [0.65, 0.95, 0.65] : [0.75, 0.9, 0.75],
            y: [-1, 1, -1]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="text-white tracking-[0.45em] pl-[0.45em] font-sans font-extralight text-xs bg-black/60 px-5.5 py-2 rounded-full border border-white/5 backdrop-blur-lg shadow-3xl flex items-center gap-2"
        >
          <div 
            className={`w-1.5 h-1.5 rounded-full ${
              state === "speaking" 
                ? "bg-amber-500 animate-ping" 
                : state === "listening" 
                ? "bg-purple-500 animate-pulse" 
                : state === "processing" 
                ? "bg-cyan-500 animate-spin" 
                : "bg-blue-500"
            }`} 
          />
          <span>NEO</span>
        </motion.div>
      </div>
    </div>
  );
}

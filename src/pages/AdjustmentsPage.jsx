import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, Dices } from "lucide-react";
import MacroSection from "../components/ui/MacroSection";
import ColorControls from "../components/controls/ColorControls";
import BlurControls from "../components/controls/BlurControls";
import Histogram from "../components/analytics/Histogram";
import NoiseControls from "../components/controls/NoiseControls";
import useParamsStore, { COLOR_CONTROLS, BLUR_CONTROLS, NOISE_CONTROLS } from "../stores/data/paramsStore";

const colorKeys = Object.keys(COLOR_CONTROLS);
const blurKeys = Object.keys(BLUR_CONTROLS);
const noiseKeys = Object.keys(NOISE_CONTROLS);

export default function AdjustmentsPage() {
    const [shellHost, setShellHost] = useState(null);
    const showHistogram = useParamsStore((s) => s.histogramVisible);
    const setShowHistogram = useParamsStore((s) => s.setHistogramVisible);
    const resetParams = useParamsStore((s) => s.resetParams);
    const randomizeParams = useParamsStore((s) => s.randomizeParams);

    // Section-specific actions from store
    const resetKeys = useParamsStore((s) => s.resetKeys);
    const randomizeKeys = useParamsStore((s) => s.randomizeKeys);

    // Accordion state
    const [openSections, setOpenSections] = useState(() => {
        try {
            const saved = localStorage.getItem("dither-dot:open-sections");
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error("Error parsing open sections", e);
        }
        return {
            colors: true,
            noise: true,
            blur: true
        };
    });

    const toggleSection = (section) => {
        setOpenSections((prev) => {
            const next = {
                ...prev,
                [section]: !prev[section]
            };
            localStorage.setItem("dither-dot:open-sections", JSON.stringify(next));
            return next;
        });
    };

    // Check if sections are modified (differ from default values)
    const isColorModified = useParamsStore((s) => colorKeys.some((k) => s[k] !== COLOR_CONTROLS[k].default));
    const isNoiseModified = useParamsStore((s) => noiseKeys.some((k) => s[k] !== NOISE_CONTROLS[k].default));
    const isBlurModified = useParamsStore((s) => blurKeys.some((k) => s[k] !== BLUR_CONTROLS[k].default));

    const setRootNode = useCallback((node) => {
        if (!node) return;
        setShellHost(node.closest('.resizable-shell') || null);
    }, []);

    return (
        <>
            <div ref={setRootNode}>
                <MacroSection title="ADJUSTMENTS">
                    <div className="bv-section histogram-section">
                        <div className="bv-controls-row">
                            <span className="bv-label">HISTOGRAM</span>
                            <div className="bv-option-group histogram-toggle-group">
                                <button
                                    type="button"
                                    className={`bv-option-btn${showHistogram ? ' active' : ''}`}
                                    onClick={() => setShowHistogram(true)}
                                >
                                    SHOW
                                </button>
                                <button
                                    type="button"
                                    className={`bv-option-btn${!showHistogram ? ' active' : ''}`}
                                    onClick={() => setShowHistogram(false)}
                                >
                                    HIDE
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="bv-section">
                        <p className="bv-label">ACTIONS</p>
                        <div className="bv-option-group">
                            <button
                                type="button"
                                className="bv-option-btn icon-btn"
                                onClick={resetParams}
                            >
                                <RotateCcw size={14} strokeWidth={1.5} />
                                RESET DEFAULT
                            </button>
                            <button
                                type="button"
                                className="bv-option-btn icon-btn"
                                onClick={randomizeParams}
                            >
                                <Dices size={14} strokeWidth={1.5} />
                                RANDOMIZE
                            </button>
                        </div>
                    </div>
                </MacroSection>

                <MacroSection
                    title="COLORS"
                    collapsible
                    isOpen={openSections.colors}
                    onToggle={() => toggleSection('colors')}
                    isModified={isColorModified}
                    onReset={() => resetKeys(colorKeys)}
                    onRandomize={() => randomizeKeys(colorKeys, COLOR_CONTROLS)}
                >
                    <ColorControls showLabel={false} />
                </MacroSection>

                <MacroSection
                    title="NOISE"
                    collapsible
                    isOpen={openSections.noise}
                    onToggle={() => toggleSection('noise')}
                    isModified={isNoiseModified}
                    onReset={() => resetKeys(noiseKeys)}
                    onRandomize={() => randomizeKeys(noiseKeys, NOISE_CONTROLS)}
                >
                    <NoiseControls showLabel={false} />
                </MacroSection>

                <MacroSection
                    title="BLUR"
                    collapsible
                    isOpen={openSections.blur}
                    onToggle={() => toggleSection('blur')}
                    isModified={isBlurModified}
                    onReset={() => resetKeys(blurKeys)}
                    onRandomize={() => randomizeKeys(blurKeys, BLUR_CONTROLS)}
                >
                    <BlurControls showLabel={false} />
                </MacroSection>
            </div>

            {showHistogram && shellHost && createPortal(
                <div className="histogram-floating-panel">
                    <p className="bv-label">HISTOGRAM</p>
                    <Histogram />
                </div>,
                shellHost,
            )}
        </>
    );
}

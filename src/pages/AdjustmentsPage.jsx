import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, Dices, ChevronDown } from "lucide-react";
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
                <div className="bv-macro-section">
                    <h2>ADJUSTMENTS</h2>
                    <div className="bv-section">
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
                </div>

                <div className="bv-macro-section">
                    <div className={`bv-macro-section-header ${isColorModified ? 'modified' : ''}`} onClick={() => toggleSection('colors')}>
                        <div className="bv-macro-section-title">
                            <ChevronDown size={16} className={`bv-macro-section-chevron ${openSections.colors ? '' : 'collapsed'}`} />
                            <h2>COLORS</h2>
                        </div>
                        <div className="bv-macro-section-actions">
                            {isColorModified && (
                                <button
                                    type="button"
                                    className="bv-macro-section-btn"
                                    title="Reset colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        resetKeys(colorKeys);
                                    }}
                                >
                                    <RotateCcw size={16} strokeWidth={1.5} />
                                </button>
                            )}
                            <button
                                type="button"
                                className="bv-macro-section-btn"
                                title="Randomize colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    randomizeKeys(colorKeys, COLOR_CONTROLS);
                                }}
                            >
                                <Dices size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                    </div>
                    <div className={`bv-macro-section-content ${openSections.colors ? '' : 'collapsed'}`}>
                        <ColorControls showLabel={false} />
                    </div>
                </div>

                <div className="bv-macro-section">
                    <div className={`bv-macro-section-header ${isNoiseModified ? 'modified' : ''}`} onClick={() => toggleSection('noise')}>
                        <div className="bv-macro-section-title">
                            <ChevronDown size={16} className={`bv-macro-section-chevron ${openSections.noise ? '' : 'collapsed'}`} />
                            <h2>NOISE</h2>
                        </div>
                        <div className="bv-macro-section-actions">
                            {isNoiseModified && (
                                <button
                                    type="button"
                                    className="bv-macro-section-btn"
                                    title="Reset noise"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        resetKeys(noiseKeys);
                                    }}
                                >
                                    <RotateCcw size={16} strokeWidth={1.5} />
                                </button>
                            )}
                            <button
                                type="button"
                                className="bv-macro-section-btn"
                                title="Randomize noise"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    randomizeKeys(noiseKeys, NOISE_CONTROLS);
                                }}
                            >
                                <Dices size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                    </div>
                    <div className={`bv-macro-section-content ${openSections.noise ? '' : 'collapsed'}`}>
                        <NoiseControls showLabel={false} />
                    </div>
                </div>

                <div className="bv-macro-section">
                    <div className={`bv-macro-section-header ${isBlurModified ? 'modified' : ''}`} onClick={() => toggleSection('blur')}>
                        <div className="bv-macro-section-title">
                            <ChevronDown size={16} className={`bv-macro-section-chevron ${openSections.blur ? '' : 'collapsed'}`} />
                            <h2>BLUR</h2>
                        </div>
                        <div className="bv-macro-section-actions">
                            {isBlurModified && (
                                <button
                                    type="button"
                                    className="bv-macro-section-btn"
                                    title="Reset blur"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        resetKeys(blurKeys);
                                    }}
                                >
                                    <RotateCcw size={16} strokeWidth={1.5} />
                                </button>
                            )}
                            <button
                                type="button"
                                className="bv-macro-section-btn"
                                title="Randomize blur"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    randomizeKeys(blurKeys, BLUR_CONTROLS);
                                }}
                            >
                                <Dices size={16} strokeWidth={1.5} />
                            </button>
                        </div>
                    </div>
                    <div className={`bv-macro-section-content ${openSections.blur ? '' : 'collapsed'}`}>
                        <BlurControls showLabel={false} />
                    </div>
                </div>
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

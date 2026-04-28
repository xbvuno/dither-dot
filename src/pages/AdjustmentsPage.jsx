import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, Dices } from "lucide-react";
import ColorControls from "../components/ColorControls";
import BlurControls from "../components/BlurControls";
import Histogram from "../components/Histogram";
import NoiseControls from "../components/NoiseControls";
import useParamsStore from "../stores/paramsStore";

export default function AdjustmentsPage() {
    const [shellHost, setShellHost] = useState(null);
    const showHistogram = useParamsStore((s) => s.histogramVisible);
    const setShowHistogram = useParamsStore((s) => s.setHistogramVisible);
    const resetParams = useParamsStore((s) => s.resetParams);
    const randomizeParams = useParamsStore((s) => s.randomizeParams);

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
                                <RotateCcw size={13} strokeWidth={1.5} />
                                RESET DEFAULT
                            </button>
                            <button
                                type="button"
                                className="bv-option-btn icon-btn"
                                onClick={randomizeParams}
                            >
                                <Dices size={13} strokeWidth={1.5} />
                                RANDOMIZE
                            </button>
                        </div>
                    </div>

                </div>

                <div className="bv-macro-section">
                    <h2>COLORS</h2>
                    <ColorControls showLabel={false} />
                </div>

                <div className="bv-macro-section">
                    <h2>NOISE</h2>
                    <NoiseControls showLabel={false} />
                </div>

                <div className="bv-macro-section">
                    <h2>BLUR</h2>
                    <BlurControls showLabel={false} />
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


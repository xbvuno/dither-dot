import { RotateCcw, Dices } from "lucide-react";
import MacroSection from "../components/ui/MacroSection";
import ColorControls from "../components/controls/ColorControls";
import BlurControls from "../components/controls/BlurControls";
import Histogram from "../components/analytics/Histogram";
import NoiseControls from "../components/controls/NoiseControls";
import useAccordion from "../hooks/useAccordion";
import useParamsStore, {
    selectIsColorModified,
    selectIsNoiseModified,
    selectIsBlurModified,
} from "../stores/data/paramsStore";

export default function AdjustmentsPage() {
    const resetParams = useParamsStore((s) => s.resetParams);
    const randomizeParams = useParamsStore((s) => s.randomizeParams);

    const resetColors = useParamsStore((s) => s.resetColors);
    const randomizeColors = useParamsStore((s) => s.randomizeColors);

    const resetNoise = useParamsStore((s) => s.resetNoise);
    const randomizeNoise = useParamsStore((s) => s.randomizeNoise);

    const resetBlur = useParamsStore((s) => s.resetBlur);
    const randomizeBlur = useParamsStore((s) => s.randomizeBlur);

    const [openSections, toggleSection] = useAccordion("dither-dot:open-sections", {
        colors: true,
        noise: true,
        blur: true,
    });

    const isColorModified = useParamsStore(selectIsColorModified);
    const isNoiseModified = useParamsStore(selectIsNoiseModified);
    const isBlurModified = useParamsStore(selectIsBlurModified);

    return (
        <div>
            <MacroSection title="ADJUSTMENTS">
                <div className="bv-section histogram-section">
                    <span className="bv-label">HISTOGRAM</span>
                    <Histogram />
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
                onReset={resetColors}
                onRandomize={randomizeColors}
            >
                <ColorControls showLabel={false} />
            </MacroSection>

            <MacroSection
                title="NOISE"
                collapsible
                isOpen={openSections.noise}
                onToggle={() => toggleSection('noise')}
                isModified={isNoiseModified}
                onReset={resetNoise}
                onRandomize={randomizeNoise}
            >
                <NoiseControls showLabel={false} />
            </MacroSection>

            <MacroSection
                title="BLUR"
                collapsible
                isOpen={openSections.blur}
                onToggle={() => toggleSection('blur')}
                isModified={isBlurModified}
                onReset={resetBlur}
                onRandomize={randomizeBlur}
            >
                <BlurControls showLabel={false} />
            </MacroSection>
        </div>
    );
}


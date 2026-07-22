import { useEffect, useRef, useState, useId } from "react"

export default function AutoResizingInput({ min, max, step, value: externalValue, onChange, label, 'aria-label': ariaLabelProp, name, id }) {
    const generatedId = useId()
    const ariaLabel = ariaLabelProp || label || name || 'Numeric input'
    const inputName = name || (label ? label.toLowerCase().replace(/\s+/g, '-') : 'numeric-input')
    const inputId = id || `input-${inputName}-${generatedId.replace(/:/g, '')}`
    const [draftValue, setDraftValue] = useState(String(externalValue ?? ''))
    const [isValid, setIsValid] = useState(true)
    const [isEditing, setIsEditing] = useState(false)

    const inputRef = useRef(null)
    const lastValidRef = useRef(String(externalValue ?? ''))
    const lastValidNumRef = useRef(Number(externalValue ?? min))
    const invalidTimerRef = useRef(null)
    const externalString = String(externalValue ?? '')
    const displayedValue = isEditing ? draftValue : externalString

    // ---- resize ----
    useEffect(() => {
        const input = inputRef.current
        if (!input) return
        input.style.width = `min(100%, ${displayedValue.length + 6 - (displayedValue < 0 ? -1 : 0)}ch)`
    }, [displayedValue])

    // ---- cleanup timer on unmount ----
    useEffect(() => {
        return () => {
            if (invalidTimerRef.current)
                clearTimeout(invalidTimerRef.current)
        }
    }, [])

    // ---- helper: revert ----
    function revertToLastValid() {
        const last = lastValidRef.current
        const num = lastValidNumRef.current

        setDraftValue(last)
        setIsEditing(false)
        setIsValid(true)
        onChange?.(num)
    }

    function startRevertTimer() {
        if (invalidTimerRef.current)
            clearTimeout(invalidTimerRef.current)

        invalidTimerRef.current = setTimeout(
            revertToLastValid,
            2000
        )
    }

    const updateLastValidFromExternal = () => {
        const num = Number(externalValue)
        if (Number.isNaN(num)) {
            return false
        }

        const stepped =
            Math.round((num - min) / step) * step + min

        const steppedNum =
            Math.round(stepped * 1e10) / 1e10

        if (steppedNum < min || steppedNum > max) {
            return false
        }

        lastValidRef.current = String(steppedNum)
        lastValidNumRef.current = steppedNum
        return true
    }

    function handleFocus() {
        updateLastValidFromExternal()
        setDraftValue(externalString)
        setIsEditing(true)
        setIsValid(true)
    }

    function handleBlur() {
        if (invalidTimerRef.current) {
            clearTimeout(invalidTimerRef.current)
            invalidTimerRef.current = null
        }

        setIsEditing(false)

        if (!isValid) {
            setDraftValue(lastValidRef.current)
            setIsValid(true)
        }
    }

    function handleInputChange(e) {
        const input = e.target
        const newValue = input.value
        setDraftValue(newValue)

        const num = input.valueAsNumber

        if (Number.isNaN(num)) {
            setIsValid(false)
            startRevertTimer()
            return
        }

        const stepped =
            Math.round((num - min) / step) * step + min

        const steppedNum =
            Math.round(stepped * 1e10) / 1e10

        if (steppedNum < min || steppedNum > max) {
            setIsValid(false)
            startRevertTimer()
            return
        }

        const steppedStr = String(steppedNum)

        if (steppedStr !== newValue)
            setDraftValue(steppedStr)

        if (invalidTimerRef.current) {
            clearTimeout(invalidTimerRef.current)
            invalidTimerRef.current = null
        }

        setIsValid(true)
        lastValidRef.current = steppedStr
        lastValidNumRef.current = steppedNum

        onChange?.(steppedNum)
    }

    return (
        <input
            ref={inputRef}
            type="number"
            name={inputName}
            id={inputId}
            min={min}
            max={max}
            step={step}
            value={displayedValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            aria-invalid={!isValid}
            aria-label={ariaLabel}
        />
    )
}
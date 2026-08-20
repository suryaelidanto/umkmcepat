import { useCallback, useMemo, useState } from "react";

import type { ZodError, ZodSchema } from "zod";

export type ValidatedFormOptions<TValues extends Record<string, unknown>> = {
  schema: ZodSchema<TValues>;
  initialValues: TValues;
  onSubmit: (values: TValues) => unknown | Promise<unknown>;
};

export type FieldError = string | null;

export type ValidatedFormResult<TValues extends Record<string, unknown>> = {
  values: TValues;
  setField: <K extends keyof TValues>(name: K, value: TValues[K]) => void;
  errors: Partial<Record<keyof TValues, FieldError>>;
  touched: Partial<Record<keyof TValues, boolean>>;
  hasError: (name: keyof TValues) => boolean;
  errorMessage: (name: keyof TValues) => string | null;
  markTouched: (name: keyof TValues) => void;
  handleSubmit: () => Promise<void>;
  isSubmitting: boolean;
  setSubmitting: (next: boolean) => void;
  reset: (nextValues?: TValues) => void;
};

export function useValidatedForm<TValues extends Record<string, unknown>>(
  options: ValidatedFormOptions<TValues>,
): ValidatedFormResult<TValues> {
  const { schema, initialValues, onSubmit } = options;
  const [values, setValues] = useState<TValues>(initialValues);
  const [touched, setTouched] = useState<
    Partial<Record<keyof TValues, boolean>>
  >({});
  const [submitErrors, setSubmitErrors] = useState<
    Partial<Record<keyof TValues, FieldError>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField: ValidatedFormResult<TValues>["setField"] = useCallback(
    (name, value) => {
      setValues((current) => ({ ...current, [name]: value }));
      // Clear error on edit so the red border fades as the user fixes it.
      setSubmitErrors((current) => {
        if (!current[name]) {
          return current;
        }
        const next = { ...current };
        delete next[name];
        return next;
      });
    },
    [],
  );

  const markTouched: ValidatedFormResult<TValues>["markTouched"] = useCallback(
    (name) => {
      setTouched((current) =>
        current[name] ? current : { ...current, [name]: true },
      );
    },
    [],
  );

  // Re-parse the whole form whenever a value changes so dependents (e.g. a
  const liveFieldErrors = useMemo(() => {
    const parsed = schema.safeParse(values);
    const out: Partial<Record<keyof TValues, FieldError>> = {};
    if (parsed.success) {
      return out;
    }
    (Object.keys(values) as Array<keyof TValues>).forEach((name) => {
      const issue = findIssue(parsed.error, String(name));
      if (issue) {
        out[name] = issue;
      }
    });
    return out;
  }, [schema, values]);

  const errors: ValidatedFormResult<TValues>["errors"] = useMemo(() => {
    const out: Partial<Record<keyof TValues, FieldError>> = {};
    (Object.keys(values) as Array<keyof TValues>).forEach((name) => {
      const submitErr = submitErrors[name] ?? null;
      const liveErr = liveFieldErrors[name] ?? null;
      if (submitErr || liveErr) {
        out[name] = submitErr ?? liveErr;
      }
    });
    return out;
  }, [liveFieldErrors, submitErrors, values]);

  const hasError: ValidatedFormResult<TValues>["hasError"] = useCallback(
    (name) => Boolean(touched[name]) && Boolean(errors[name]),
    [errors, touched],
  );

  const errorMessage: ValidatedFormResult<TValues>["errorMessage"] =
    useCallback(
      (name) => (hasError(name) ? (errors[name] ?? null) : null),
      [errors, hasError],
    );

  const handleSubmit: ValidatedFormResult<TValues>["handleSubmit"] =
    useCallback(async () => {
      const result = schema.safeParse(values);
      if (!result.success) {
        const nextTouched: Partial<Record<keyof TValues, boolean>> = {};
        const nextSubmitErrors: Partial<Record<keyof TValues, FieldError>> = {};
        (Object.keys(values) as Array<keyof TValues>).forEach((name) => {
          nextTouched[name] = true;
          const message = findIssue(result.error, String(name));
          if (message) {
            nextSubmitErrors[name] = message;
          }
        });
        setTouched(nextTouched);
        setSubmitErrors(nextSubmitErrors);
        throw new Error("Form tidak valid.");
      }
      setIsSubmitting(true);
      try {
        await onSubmit(result.data as TValues);
      } finally {
        setIsSubmitting(false);
      }
    }, [schema, values, onSubmit]);

  const reset: ValidatedFormResult<TValues>["reset"] = useCallback(
    (nextValues) => {
      setValues(nextValues ?? initialValues);
      setTouched({});
      setSubmitErrors({});
    },
    [initialValues],
  );

  return {
    errorMessage,
    errors,
    handleSubmit,
    hasError,
    isSubmitting,
    markTouched,
    reset,
    setField,
    setSubmitting: setIsSubmitting,
    touched,
    values,
  };
}

// Pull the first zod issue message for `path` (e.g. "email").
function findIssue(error: ZodError, path: string): string | null {
  const issue = error.issues.find((item) => item.path.join(".") === path);
  return issue ? issue.message : null;
}

// Shared error-message extraction for `supabase.functions.invoke(...)` call
// sites. The Supabase JS client wraps a non-2xx Edge Function response in a
// generic FunctionsHttpError whose `.message` is unhelpful ("Edge Function
// returned a non-2xx status code") — the actual `{error: "..."}` body our
// functions return has to be read back out of `error.context`, a Response
// object, to surface anything useful to the user.
export async function readFunctionError(error: unknown): Promise<string> {
  const fallback = "Something went wrong. Please try again.";

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const possibleError = error as {
    message?: string;
    context?: Response;
  };

  if (possibleError.context instanceof Response) {
    try {
      const responseBody = await possibleError.context.clone().json();

      if (typeof responseBody?.error === "string") {
        return responseBody.error;
      }

      if (typeof responseBody?.message === "string") {
        return responseBody.message;
      }

      return JSON.stringify(responseBody);
    } catch {
      try {
        const responseText = await possibleError.context.clone().text();

        if (responseText.trim()) {
          return responseText;
        }
      } catch {
        // Fall back to the standard error message below.
      }
    }
  }

  return possibleError.message || fallback;
}

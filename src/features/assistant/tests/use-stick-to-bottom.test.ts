import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { ChatMessage } from "../use-assistant-chat";
import { useStickToBottom } from "../use-stick-to-bottom";

/** A transcript of 1000 px of content seen through 200 px. */
function transcript() {
  const element = document.createElement("div");
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: 200 });
  return element;
}

const message = (id: string, role: ChatMessage["role"], text = ""): ChatMessage =>
  ({ id, role, text, status: "done", steps: [] }) as unknown as ChatMessage;

describe("useStickToBottom", () => {
  test("follows the end, leaves a user who went up where they are, and comes back on a prompt", () => {
    const element = transcript();
    const ref = { current: element };
    let messages = [message("u1", "user"), message("a1", "assistant", "Hel")];
    const { result, rerender } = renderHook(
      ({ list }) => useStickToBottom(ref, { messages: list, conversationId: "c1" }),
      { initialProps: { list: messages } },
    );
    // At the end as it opens.
    expect(element.scrollTop).toBe(1000);

    // The user goes up to read: the answer streamed does not take the scroll.
    element.scrollTop = 100;
    result.current();
    messages = [messages[0]!, message("a1", "assistant", "Hello")];
    rerender({ list: messages });
    expect(element.scrollTop).toBe(100);

    // Near the end again, within the distance: followed.
    element.scrollTop = 780;
    result.current();
    messages = [messages[0]!, message("a1", "assistant", "Hello there")];
    rerender({ list: messages });
    expect(element.scrollTop).toBe(1000);

    // Up again, then a prompt sent: back to the end.
    element.scrollTop = 0;
    result.current();
    rerender({ list: [...messages, message("u2", "user")] });
    expect(element.scrollTop).toBe(1000);
  });

  test("keeps the position a restore gives", () => {
    const element = transcript();
    const { rerender } = renderHook(
      ({ list }) =>
        useStickToBottom(
          { current: element },
          {
            messages: list,
            restore: (log) => {
              log.scrollTop = 42;
              return true;
            },
          },
        ),
      { initialProps: { list: [message("u1", "user")] } },
    );
    rerender({ list: [message("u0", "user"), message("u1", "user")] });
    expect(element.scrollTop).toBe(42);
  });
});

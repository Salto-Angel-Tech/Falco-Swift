import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Question } from "@/api/types";
import { QuestionEditor } from "./QuestionEditor";

function setup(initial: Question, extra: { serverError?: string } = {}) {
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <QuestionEditor
      name="topic"
      question={initial}
      otherNames={["urgent"]}
      serverError={extra.serverError}
      onSave={onSave}
      onCancel={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  return { onSave, user };
}

describe("QuestionEditor", () => {
  it("shows a validation message when a choice has fewer than two options", async () => {
    const { user } = setup({ type: "choice", instructions: "Which area", options: ["a", "b"] });
    expect(screen.queryByText(/needs at least 2 options/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove options 2" }));
    expect(screen.getByText("A choice question needs at least 2 options.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save question" })).toBeDisabled();
  });

  it("requires instructions", async () => {
    const { user } = setup({ type: "noul", instructions: "Is it urgent" });
    await user.clear(screen.getByLabelText("Instructions"));
    expect(screen.getByText("Instructions are required.")).toBeInTheDocument();
  });

  it("switches to score and shows the levels editor", async () => {
    const { user } = setup({ type: "noul", instructions: "x" });
    await user.click(screen.getByLabelText("Type"));
    await user.click(await screen.findByRole("option", { name: "score" }));
    expect(screen.getByRole("group", { name: "levels" })).toBeInTheDocument();
    expect(screen.getByText("Levels cannot be blank.")).toBeInTheDocument();
  });

  it("shows the server error for this question", () => {
    setup({ type: "noul", instructions: "x" }, { serverError: "topic is not a valid question" });
    expect(screen.getByText(/Server: topic is not a valid question/)).toBeInTheDocument();
  });

  it("rejects renaming to an existing name", async () => {
    const { user, onSave } = setup({ type: "noul", instructions: "x" });
    const input = screen.getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "urgent");
    await user.click(screen.getByRole("button", { name: "Save question" }));
    expect(screen.getByText('"urgent" already exists.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the edited question with its trimmed new name", async () => {
    const { user, onSave } = setup({ type: "choice", instructions: "Which area", options: ["a", "b"] });
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, " area ");
    await user.type(screen.getByLabelText("options 2"), "c");
    await user.click(screen.getByRole("button", { name: "Save question" }));
    expect(onSave).toHaveBeenCalledWith("area", {
      type: "choice",
      instructions: "Which area",
      options: ["a", "bc"],
    });
  });
});

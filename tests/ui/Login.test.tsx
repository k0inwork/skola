// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../../src/pages/Login";

function renderLogin(initialPath = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Login />
    </MemoryRouter>
  );
}

describe("Login page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the school name", () => {
    renderLogin();
    expect(screen.getByText("Olaines autoskola")).toBeInTheDocument();
  });

  it("shows Google login button", () => {
    renderLogin();
    expect(screen.getByText("Turpināt ar Google")).toBeInTheDocument();
  });

  it("shows blocked error when query param is set", () => {
    renderLogin("/login?blocked=1");
    expect(
      screen.getByText("Jūsu konts ir bloķēts. Lūdzu sazinieties ar instruktoru.")
    ).toBeInTheDocument();
  });

  it("shows returning user profile from localStorage", () => {
    localStorage.setItem("skola_profile", JSON.stringify({ name: "Anna", picture: "" }));
    renderLogin();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText(/Laipni lūgti atpakaļ/)).toBeInTheDocument();
    expect(screen.getByText("Turpināt kā Anna")).toBeInTheDocument();
  });

  it("shows switch account link for returning user", () => {
    localStorage.setItem("skola_profile", JSON.stringify({ name: "Anna", picture: "" }));
    renderLogin();
    expect(screen.getByText(/Nav Anna\?/)).toBeInTheDocument();
  });

  it("removes profile when switch account is clicked", () => {
    localStorage.setItem("skola_profile", JSON.stringify({ name: "Anna", picture: "" }));
    renderLogin();
    fireEvent.click(screen.getByText(/Nav Anna\?/));
    expect(localStorage.getItem("skola_profile")).toBeNull();
    expect(screen.queryByText("Anna")).not.toBeInTheDocument();
  });

  it("shows error when Google auth URL fetch fails", async () => {
    // Mock window.fetch to return a failed response for the Google URL endpoint
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }));

    renderLogin();
    fireEvent.click(screen.getByText("Turpināt ar Google"));

    await waitFor(() => {
      expect(screen.getByText("Failed to get Google auth URL")).toBeInTheDocument();
    });
  });

  it("shows error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    renderLogin();
    fireEvent.click(screen.getByText("Turpināt ar Google"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const unirse = vi.hoisted(() => vi.fn());
vi.mock("@/app/acciones/lista-de-espera", () => ({ unirseAListaDeEspera: unirse }));

import { WaitlistForm } from "./WaitlistForm";

beforeEach(() => {
  unirse.mockReset();
  unirse.mockResolvedValue({ estado: "inicial" });
});

const pasos = () => screen.getByRole("list", { name: "La inscripción se verifica en dos pasos" });

describe("WaitlistForm · dos pasos", () => {
  it("muestra los dos pasos de la inscripción y marca el primero como el actual", () => {
    render(<WaitlistForm marca="1.abc" />);
    const [uno, dos] = within(pasos()).getAllByRole("listitem");
    expect(uno).toHaveAttribute("aria-current", "step");
    expect(dos).not.toHaveAttribute("aria-current");
    expect(uno).toHaveTextContent("Paso 1 de 2: Deja tu correo y acepta los textos");
    expect(dos).toHaveTextContent("Paso 2 de 2: Confirma desde el enlace que te enviamos");
  });

  it("al enviar bien, el segundo paso pasa a ser el actual y se explica qué falta", async () => {
    unirse.mockResolvedValue({ estado: "ok", prueba: false });
    const user = userEvent.setup();
    render(<WaitlistForm marca="1.abc" />);
    await user.type(screen.getByLabelText("Tu correo"), "persona@correo.cl");
    await user.click(screen.getByLabelText(/Acepto las condiciones de uso/));
    await user.click(screen.getByLabelText(/Acepto que Otea guarde mi correo/));
    await user.click(screen.getByRole("button", { name: "Unirme a la lista" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Paso 2 de 2: revisa tu correo"));
    expect(screen.getByRole("status")).toHaveTextContent("Sin ese paso no quedas inscrito");
    const [uno, dos] = within(pasos()).getAllByRole("listitem");
    expect(dos).toHaveAttribute("aria-current", "step");
    expect(uno).not.toHaveAttribute("aria-current");
    expect(uno).toHaveTextContent("Paso 1 de 2, hecho:");
  });

  it("envía por separado la aceptación de las condiciones y el consentimiento para guardar el correo", async () => {
    const user = userEvent.setup();
    render(<WaitlistForm marca="1.abc" />);
    await user.type(screen.getByLabelText("Tu correo"), "persona@correo.cl");
    await user.click(screen.getByLabelText(/Acepto las condiciones de uso/));
    await user.click(screen.getByRole("button", { name: "Unirme a la lista" }));

    await waitFor(() => expect(unirse).toHaveBeenCalledTimes(1));
    const datos = unirse.mock.calls[0][1] as FormData;
    expect(datos.get("correo")).toBe("persona@correo.cl");
    expect(datos.get("condiciones")).toBe("on");
    expect(datos.get("acepta")).toBeNull();
    expect(datos.get("tiempo")).toBe("1.abc");
  });
});

describe("WaitlistForm · apartado de condiciones", () => {
  it("agrupa las dos aceptaciones bajo «Antes de enviar», cada una con su enlace", () => {
    render(<WaitlistForm marca="1.abc" />);
    const grupo = screen.getByRole("group", { name: "Antes de enviar" });
    const condiciones = within(grupo).getByLabelText(/Acepto las condiciones de uso/);
    const consentimiento = within(grupo).getByLabelText(/Acepto que Otea guarde mi correo/);
    for (const casilla of [condiciones, consentimiento]) {
      expect(casilla).toHaveAttribute("type", "checkbox");
      expect(casilla).toBeRequired();
      expect(casilla).not.toBeChecked();
    }
    expect(condiciones).toHaveAttribute("name", "condiciones");
    expect(consentimiento).toHaveAttribute("name", "acepta");
    expect(within(grupo).getAllByRole("link", { name: /condiciones de uso/i }).every((a) => a.getAttribute("href") === "/terminos")).toBe(true);
    expect(within(grupo).getByRole("link", { name: "política de privacidad" })).toHaveAttribute("href", "/privacidad");
  });

  it("resume lo esencial de las condiciones y enlaza el texto completo", () => {
    render(<WaitlistForm marca="1.abc" />);
    const resumen = screen.getByText("Lo esencial de las condiciones de uso").closest("details")!;
    expect(resumen).not.toHaveAttribute("open");
    expect(resumen).toHaveTextContent("No constituye asesoría financiera");
    expect(resumen).toHaveTextContent("«Datos de ejemplo»");
    expect(resumen).toHaveTextContent("El asistente de preguntas puede fallar");
    expect(within(resumen).getByRole("link", { name: "Leer las condiciones de uso completas" })).toHaveAttribute("href", "/terminos");
  });

  it("si falta alguna aceptación, el error va ligado a su casilla", async () => {
    unirse.mockResolvedValue({
      estado: "invalida",
      errores: {
        acepta: "Necesitamos tu consentimiento para guardar el correo.",
        condiciones: "Para inscribirte necesitas aceptar las condiciones de uso.",
      },
    });
    const user = userEvent.setup();
    render(<WaitlistForm marca="1.abc" />);
    await user.click(screen.getByRole("button", { name: "Unirme a la lista" }));

    const condiciones = await screen.findByLabelText(/Acepto las condiciones de uso/);
    await waitFor(() => expect(condiciones).toHaveAttribute("aria-invalid", "true"));
    expect(condiciones).toHaveAccessibleDescription("Para inscribirte necesitas aceptar las condiciones de uso.");
    const consentimiento = screen.getByLabelText(/Acepto que Otea guarde mi correo/);
    expect(consentimiento).toHaveAttribute("aria-invalid", "true");
    expect(consentimiento).toHaveAccessibleDescription("Necesitamos tu consentimiento para guardar el correo.");
  });

  it("si el envío no prosperó, conserva lo escrito y las casillas marcadas (React vacía el formulario al terminar)", async () => {
    unirse.mockResolvedValue({
      estado: "invalida",
      errores: { acepta: "Necesitamos tu consentimiento para guardar el correo." },
      valores: { correo: "persona@correo.cl", condiciones: true, acepta: false },
    });
    const user = userEvent.setup();
    render(<WaitlistForm marca="1.abc" />);
    await user.type(screen.getByLabelText("Tu correo"), "persona@correo.cl");
    await user.click(screen.getByLabelText(/Acepto las condiciones de uso/));
    await user.click(screen.getByRole("button", { name: "Unirme a la lista" }));

    await waitFor(() => expect(screen.getByLabelText(/Acepto que Otea guarde mi correo/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByLabelText("Tu correo")).toHaveValue("persona@correo.cl");
    expect(screen.getByLabelText(/Acepto las condiciones de uso/)).toBeChecked();
    expect(screen.getByLabelText(/Acepto que Otea guarde mi correo/)).not.toBeChecked();
  });

  it("si la inscripción salió bien, el formulario queda vacío: no se conserva el correo", async () => {
    unirse.mockResolvedValue({ estado: "ok", prueba: false });
    const user = userEvent.setup();
    render(<WaitlistForm marca="1.abc" />);
    await user.type(screen.getByLabelText("Tu correo"), "persona@correo.cl");
    await user.click(screen.getByLabelText(/Acepto las condiciones de uso/));
    await user.click(screen.getByLabelText(/Acepto que Otea guarde mi correo/));
    await user.click(screen.getByRole("button", { name: "Unirme a la lista" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Paso 2 de 2"));
    expect(screen.getByLabelText("Tu correo")).toHaveValue("");
    expect(screen.getByLabelText(/Acepto las condiciones de uso/)).not.toBeChecked();
    expect(screen.getByLabelText(/Acepto que Otea guarde mi correo/)).not.toBeChecked();
  });

  it("el formulario expone su estado en data-estado y, con éxito, el botón se recoge en un check sin perder su nombre", async () => {
    unirse.mockResolvedValue({ estado: "ok", prueba: false });
    const user = userEvent.setup();
    const { container } = render(<WaitlistForm marca="1.abc" />);
    const formulario = container.querySelector("form")!;
    expect(formulario).toHaveAttribute("data-estado", "inicial");
    const boton = screen.getByRole("button", { name: "Unirme a la lista" });
    // El check vive dentro del botón, decorativo; el envoltorio es el que se recorta a un círculo de 44 px.
    expect(boton.querySelector("svg.boton-check")).toHaveAttribute("aria-hidden", "true");
    expect(boton.parentElement).toHaveClass("lista-enviar");

    await user.type(screen.getByLabelText("Tu correo"), "persona@correo.cl");
    await user.click(screen.getByLabelText(/Acepto las condiciones de uso/));
    await user.click(screen.getByLabelText(/Acepto que Otea guarde mi correo/));
    await user.click(boton);
    await waitFor(() => expect(formulario).toHaveAttribute("data-estado", "ok"));
    expect(screen.getByRole("button", { name: "Unirme a la lista" })).toBeInTheDocument();
  });

  it("si el servidor rechaza el envío, data-estado lo dice y la pista en línea deja paso al error del servidor", async () => {
    unirse.mockResolvedValue({ estado: "invalida", errores: { correo: "Escribe un correo válido." } });
    const user = userEvent.setup();
    const { container } = render(<WaitlistForm marca="1.abc" />);
    // Pista de la validación en línea (la muestra el CSS con `:user-invalid`): redactada en neutro, es la descripción del
    // campo desde el principio, así que los lectores de pantalla la oyen sin depender de enviar.
    expect(container.querySelector(".campo-pista")).toHaveTextContent("nombre@correo.cl");
    expect(screen.getByLabelText("Tu correo")).toHaveAccessibleDescription("Formato: nombre@correo.cl");
    await user.click(screen.getByRole("button", { name: "Unirme a la lista" }));
    await waitFor(() => expect(container.querySelector("form")).toHaveAttribute("data-estado", "invalida"));
    expect(screen.getByLabelText("Tu correo")).toHaveAccessibleDescription("Escribe un correo válido.");
    expect(container.querySelector(".campo-pista")).toBeNull();
  });

  it("no deja atributos style (la CSP los bloquea)", () => {
    const { container } = render(<WaitlistForm marca="1.abc" />);
    expect(container.querySelector("[style]")).toBeNull();
  });
});

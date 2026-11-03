"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { btnCls, inputCls } from "@/features/components/auth-shell";
import {
  ApiError,
  acceptLegalDocuments,
  changeDoctorSpecialty,
  createDoctorProfile,
  DOCTOR_IMAGE_MAX_BYTES,
  DOCTOR_IMAGE_TYPES,
  DOCTOR_LICENSE_MAX_BYTES,
  DOCTOR_LICENSE_TYPES,
  type DoctorLineStatus,
  type DoctorMissingItem,
  type DoctorProfile,
  type DoctorStatus,
  type DoctorVerificationHistory,
  getCurrentLegalDocuments,
  getSpecialties,
  type LegalDocument,
  type LegalDocumentType,
  type ReviewStatus,
  type Specialty,
  submitDoctorIdentity,
  submitDoctorLicense,
  updateDoctorProfile,
  uploadDoctorPhoto,
} from "@/lib/api";

export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "No se pudo completar la operación. Inténtalo de nuevo.";
}

// Validación previa en el cliente; el backend vuelve a validar tipo (por contenido) y tamaño.
export function fileProblem(
  file: File | null,
  types: string[],
  maxBytes: number,
): string {
  if (!file) return "Selecciona un archivo.";
  if (!types.includes(file.type))
    return "El tipo de archivo no está permitido.";
  if (file.size > maxBytes)
    return `El archivo supera ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  return "";
}

const LINE_LABELS: Record<DoctorLineStatus, string> = {
  required: "Pendiente de envío",
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const GLOBAL_LABELS: Record<DoctorStatus["status"], string> = {
  pending: "Registro en proceso",
  approved: "Registro aprobado",
  rejected: "Registro con observaciones",
};

const MISSING_LABELS: Record<DoctorMissingItem, string> = {
  profile: "Completar tu perfil",
  legal: "Aceptar los documentos legales vigentes para profesionales",
  identity_submission: "Enviar tu INE",
  identity_resubmission: "Volver a enviar tu INE",
  license_submission: "Enviar tu cédula profesional",
  license_resubmission: "Volver a enviar tu cédula profesional",
};

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  superseded: "Sustituida",
};

const DOCUMENT_TITLES: Partial<Record<LegalDocumentType, string>> = {
  privacy_policy: "Aviso de Privacidad",
  doctor_terms: "Términos y Condiciones para profesionales",
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 flex flex-col gap-4"
    >
      <h2 className="text-black text-[19px] sm:text-[21px] font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Feedback({ error, done }: { error: string; done?: string }) {
  if (error)
    return (
      <p role="alert" className="text-[#E23A5C] text-[14px]">
        {error}
      </p>
    );
  if (done)
    return <output className="block text-[#1E8E5A] text-[14px]">{done}</output>;
  return null;
}

const labelCls = "text-black text-[15px] flex flex-col gap-2";
const smallBtnCls =
  "h-[46px] px-5 bg-[#2F2A6B] rounded-lg text-white text-[15px] hover:bg-[#25205a] transition disabled:opacity-50 self-start";

// Sin rol: crea el perfil médico (POST /me/doctor-profile). El rol `doctor` lo fija el backend.
export function DoctorProfileForm({ onCreated }: { onCreated: () => void }) {
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    curp: "",
    specialtyId: "",
    phone: "",
    bio: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSpecialties()
      .then(setSpecialties)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.curp.trim() ||
      !form.specialtyId
    ) {
      setError("Completa nombre(s), apellidos, CURP y especialidad.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createDoctorProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        curp: form.curp,
        specialtyId: form.specialtyId,
        ...(form.phone.trim() ? { phone: form.phone } : {}),
        ...(form.bio.trim() ? { bio: form.bio } : {}),
      });
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-black text-[26px] font-medium">
        Tu perfil profesional
      </h2>
      <p className="text-[#89898A] text-[15px]">
        Tu nombre legal y tu CURP deben coincidir con tu INE. Después de
        guardarlos no podrás modificarlos desde tu cuenta.
      </p>
      <label className={labelCls}>
        Nombre(s)
        <input
          className={inputCls}
          value={form.firstName}
          onChange={set("firstName")}
          autoComplete="given-name"
        />
      </label>
      <label className={labelCls}>
        Apellidos
        <input
          className={inputCls}
          value={form.lastName}
          onChange={set("lastName")}
          autoComplete="family-name"
        />
      </label>
      <label className={labelCls}>
        CURP
        <input
          className={inputCls}
          value={form.curp}
          onChange={set("curp")}
          maxLength={18}
        />
      </label>
      <label className={labelCls}>
        Especialidad
        <select
          className={inputCls}
          value={form.specialtyId}
          onChange={set("specialtyId")}
          disabled={!specialties}
        >
          <option value="">Selecciona una especialidad</option>
          {specialties?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Teléfono (opcional)
        <input
          className={inputCls}
          value={form.phone}
          onChange={set("phone")}
          maxLength={30}
          autoComplete="tel"
        />
      </label>
      <label className={labelCls}>
        Presentación profesional (opcional)
        <textarea
          className={`${inputCls} h-[110px] py-3`}
          value={form.bio}
          onChange={set("bio")}
          maxLength={1000}
        />
      </label>
      <Feedback error={error} />
      <button type="submit" disabled={saving} className={btnCls}>
        {saving ? "Guardando..." : "Crear perfil profesional"}
      </button>
    </form>
  );
}

export function StatusSection({
  status,
  profile,
}: {
  status: DoctorStatus;
  profile: DoctorProfile;
}) {
  return (
    <Card title="Estado de tu registro">
      <p className="text-[15px] text-[#535353]">
        {profile.firstName} {profile.lastName} ·{" "}
        {profile.specialty?.name ?? "Sin especialidad"}
      </p>
      <p className="text-[18px] font-medium text-[#2F2A6B]">
        {GLOBAL_LABELS[status.status]}
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[15px]">
        <div>
          <dt className="text-[#89898A]">INE</dt>
          <dd>{LINE_LABELS[status.identity]}</dd>
        </div>
        <div>
          <dt className="text-[#89898A]">Cédula profesional</dt>
          <dd>{LINE_LABELS[status.professional]}</dd>
        </div>
      </dl>
      {status.missing.length > 0 ? (
        <div>
          <p className="text-[15px] text-black">Pendientes:</p>
          <ul className="list-disc pl-5 text-[15px] text-[#535353]">
            {status.missing.map((item) => (
              <li key={item}>{MISSING_LABELS[item]}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[15px] text-[#535353]">
          No tienes pendientes de registro.
        </p>
      )}
      {(status.identityRejectionReason || status.licenseRejectionReason) && (
        <div className="bg-[#FFF4F6] border border-[#F6C9D3] rounded-lg p-4 text-[15px]">
          <p className="font-medium text-black">Observaciones de la revisión</p>
          {status.identityRejectionReason && (
            <p>INE: {status.identityRejectionReason}</p>
          )}
          {status.licenseRejectionReason && (
            <p>Cédula: {status.licenseRejectionReason}</p>
          )}
        </div>
      )}
    </Card>
  );
}

// D-37: la aceptación pendiente no bloquea el portal; se muestra como una tarea más. Se aceptan los documentos
// vigentes del régimen del médico (audience=doctor); repetir una aceptación no la duplica.
export function DoctorLegalSection({
  pending,
  onAccepted,
}: {
  pending: boolean;
  onAccepted: () => void;
}) {
  const [documents, setDocuments] = useState<LegalDocument[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pending) return;
    getCurrentLegalDocuments("doctor")
      .then(setDocuments)
      .catch((e) => setError(errorMessage(e)));
  }, [pending]);

  if (!pending)
    return (
      <Card title="Documentos legales">
        <p className="text-[15px] text-[#535353]">
          Aceptaste los documentos legales vigentes para profesionales.
        </p>
      </Card>
    );

  const all =
    documents !== null &&
    documents.length > 0 &&
    documents.every((d) => checked[d.id]);
  const accept = async () => {
    if (!documents) return;
    setSaving(true);
    setError("");
    try {
      await acceptLegalDocuments(documents.map((d) => d.id));
      onAccepted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Documentos legales">
      <p className="text-[15px] text-[#535353]">
        Puedes seguir con tu registro, pero necesitas aceptar estos documentos
        para quedar habilitado.
      </p>
      {documents?.map((doc) => (
        <div key={doc.id} className="flex flex-col gap-2">
          <h3 className="text-[16px] font-medium text-black">
            {DOCUMENT_TITLES[doc.type] ?? doc.type} · versión {doc.version}
          </h3>
          <div className="max-h-[200px] overflow-y-auto border border-gray-200 rounded-lg p-3 text-[14px] whitespace-pre-wrap text-[#535353]">
            {doc.content}
          </div>
          <label className="flex items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              checked={!!checked[doc.id]}
              onChange={(e) =>
                setChecked({ ...checked, [doc.id]: e.target.checked })
              }
            />
            He leído y acepto {DOCUMENT_TITLES[doc.type] ?? doc.type}
          </label>
        </div>
      ))}
      {documents?.length === 0 && (
        <p className="text-[15px] text-[#535353]">
          Aún no hay documentos vigentes para profesionales.
        </p>
      )}
      <Feedback error={error} />
      <button
        type="button"
        onClick={accept}
        disabled={!all || saving}
        className={smallBtnCls}
      >
        {saving ? "Guardando..." : "Aceptar documentos"}
      </button>
    </Card>
  );
}

function FileInput({
  label,
  accept,
  onChange,
}: {
  label: string;
  accept: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className={labelCls}>
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="text-[14px]"
      />
    </label>
  );
}

const canSubmit = (line: DoctorLineStatus) =>
  line === "required" || line === "rejected";

export function IdentitySection({
  status,
  onSubmitted,
}: {
  status: DoctorStatus;
  onSubmitted: () => void;
}) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem =
      fileProblem(front, DOCTOR_IMAGE_TYPES, DOCTOR_IMAGE_MAX_BYTES) ||
      fileProblem(back, DOCTOR_IMAGE_TYPES, DOCTOR_IMAGE_MAX_BYTES);
    setError(problem);
    setDone("");
    if (problem || !front || !back) return;
    setSaving(true);
    try {
      await submitDoctorIdentity(front, back);
      setDone("INE enviada para revisión.");
      onSubmitted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="INE">
      <p className="text-[15px] text-[#535353]">
        Estado: {LINE_LABELS[status.identity]}
      </p>
      {canSubmit(status.identity) ? (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FileInput
            label="Frente (JPEG o PNG, hasta 5 MB)"
            accept="image/jpeg,image/png"
            onChange={setFront}
          />
          <FileInput
            label="Reverso (JPEG o PNG, hasta 5 MB)"
            accept="image/jpeg,image/png"
            onChange={setBack}
          />
          <Feedback error={error} done={done} />
          <button type="submit" disabled={saving} className={smallBtnCls}>
            {saving ? "Enviando..." : "Enviar INE"}
          </button>
        </form>
      ) : (
        <Feedback error="" done={done} />
      )}
    </Card>
  );
}

export function LicenseSection({
  status,
  profile,
  onSubmitted,
}: {
  status: DoctorStatus;
  profile: DoctorProfile;
  onSubmitted: () => void;
}) {
  const [licenseNumber, setLicenseNumber] = useState(
    profile.licenseNumber ?? "",
  );
  const [document, setDocument] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = !licenseNumber.trim()
      ? "Escribe tu número de cédula."
      : fileProblem(document, DOCTOR_LICENSE_TYPES, DOCTOR_LICENSE_MAX_BYTES);
    setError(problem);
    setDone("");
    if (problem || !document) return;
    setSaving(true);
    try {
      await submitDoctorLicense(licenseNumber, document);
      setDone("Cédula enviada para revisión.");
      onSubmitted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Cédula profesional">
      <p className="text-[15px] text-[#535353]">
        Estado: {LINE_LABELS[status.professional]}
      </p>
      {canSubmit(status.professional) ? (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <label className={labelCls}>
            Número de cédula
            <input
              className={inputCls}
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              maxLength={20}
            />
          </label>
          <FileInput
            label="Documento (PDF, JPEG o PNG, hasta 10 MB)"
            accept="application/pdf,image/jpeg,image/png"
            onChange={setDocument}
          />
          <Feedback error={error} done={done} />
          <button type="submit" disabled={saving} className={smallBtnCls}>
            {saving ? "Enviando..." : "Enviar cédula"}
          </button>
        </form>
      ) : (
        <Feedback error="" done={done} />
      )}
    </Card>
  );
}

// Datos libres (D-9): teléfono, presentación y foto. La especialidad se puede cambiar, pero vuelve a revisión.
export function ProfileSection({
  profile,
  onChanged,
}: {
  profile: DoctorProfile;
  onChanged: () => void;
}) {
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [specialtyId, setSpecialtyId] = useState(profile.specialty?.id ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    getSpecialties()
      .then(setSpecialties)
      .catch(() => setSpecialties([]));
  }, []);

  const run = async (action: () => Promise<void>, message: string) => {
    setError("");
    setDone("");
    try {
      await action();
      setDone(message);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const saveContact = (event: FormEvent) => {
    event.preventDefault();
    run(
      () =>
        updateDoctorProfile({
          phone: phone.trim() || null,
          bio: bio.trim() || null,
        }),
      "Datos guardados.",
    );
  };

  const saveSpecialty = () => {
    if (!specialtyId || specialtyId === profile.specialty?.id) return;
    run(
      () => changeDoctorSpecialty(specialtyId),
      "Especialidad actualizada. Si tu cédula estaba en revisión o aprobada, volverá a revisarse.",
    );
  };

  const savePhoto = () => {
    const problem = fileProblem(
      photo,
      DOCTOR_IMAGE_TYPES,
      DOCTOR_IMAGE_MAX_BYTES,
    );
    if (problem || !photo) {
      setError(problem);
      return;
    }
    run(() => uploadDoctorPhoto(photo), "Fotografía guardada.");
  };

  return (
    <Card title="Perfil profesional">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[15px]">
        <div>
          <dt className="text-[#89898A]">Nombre legal</dt>
          <dd>
            {profile.firstName} {profile.lastName}
          </dd>
        </div>
        <div>
          <dt className="text-[#89898A]">CURP</dt>
          <dd>{profile.curp}</dd>
        </div>
      </dl>
      <p className="text-[13px] text-[#89898A]">
        El nombre legal y la CURP no se modifican desde tu cuenta.
      </p>
      <form onSubmit={saveContact} className="flex flex-col gap-4" noValidate>
        <label className={labelCls}>
          Teléfono
          <input
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
          />
        </label>
        <label className={labelCls}>
          Presentación profesional
          <textarea
            className={`${inputCls} h-[110px] py-3`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={1000}
          />
        </label>
        <button type="submit" className={smallBtnCls}>
          Guardar datos
        </button>
      </form>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <label className={`${labelCls} flex-1`}>
          Especialidad
          <select
            className={inputCls}
            value={specialtyId}
            onChange={(e) => setSpecialtyId(e.target.value)}
            disabled={!specialties}
          >
            {specialties?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={saveSpecialty} className={smallBtnCls}>
          Cambiar especialidad
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <FileInput
            label={`Fotografía (JPEG o PNG, hasta 5 MB)${profile.hasPhoto ? " · ya tienes una" : ""}`}
            accept="image/jpeg,image/png"
            onChange={setPhoto}
          />
        </div>
        <button type="button" onClick={savePhoto} className={smallBtnCls}>
          Guardar fotografía
        </button>
      </div>
      <Feedback error={error} done={done} />
    </Card>
  );
}

const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("es-MX") : "—";

export function HistorySection({
  history,
}: {
  history: DoctorVerificationHistory;
}) {
  const rows = [
    ...history.identity.map((item) => ({ ...item, line: "INE" })),
    ...history.license.map((item) => ({ ...item, line: "Cédula" })),
  ];
  return (
    <Card title="Historial de revisiones">
      {rows.length === 0 ? (
        <p className="text-[15px] text-[#535353]">
          Todavía no has enviado documentos.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] text-left">
            <thead className="text-[#89898A]">
              <tr>
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Intento</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Enviado</th>
                <th className="py-2 pr-3">Revisado</th>
                <th className="py-2">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.line}-${row.attempt}`}
                  className="border-t border-gray-100"
                >
                  <td className="py-2 pr-3">{row.line}</td>
                  <td className="py-2 pr-3">{row.attempt}</td>
                  <td className="py-2 pr-3">{REVIEW_LABELS[row.status]}</td>
                  <td className="py-2 pr-3">{date(row.submittedAt)}</td>
                  <td className="py-2 pr-3">{date(row.reviewedAt)}</td>
                  <td className="py-2">{row.rejectionReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

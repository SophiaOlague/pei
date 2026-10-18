"use client";

import { UserCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserMenu } from "@/features/components/user-menu";
import { ChangePasswordModal } from "@/features/landing/pages/change-password-modal";
import {
  ApiError,
  EDITABLE_PROFILE_FIELDS,
  type EditableProfileField,
  getProfile,
  getProfilePhotoUrlCached,
  type PatientProfile,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_TYPES,
  profilePhotoChanged,
  subscribeProfilePhoto,
  updateProfile,
  uploadProfilePhoto,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";

// Perfil del paciente (GET/PATCH /me/profile, PUT/GET /me/profile/photo). Nombre, CURP y fecha de
// nacimiento son de solo lectura (DP-12); el correo no se puede cambiar (/change-email desactivado).
type Draft = Record<EditableProfileField, string>;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatBirthDate(value: string | null): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return value ?? "";
  return `${Number(match[3])} de ${MESES[Number(match[2]) - 1]}, ${match[1]}`;
}

function toDraft(profile: PatientProfile): Draft {
  return {
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactPhone: profile.emergencyContactPhone ?? "",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "No se pudo completar la operación. Inténtalo de nuevo.";
}

export function Landing() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const correo = session?.user.email ?? "";

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return true;
      }
      return false;
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setProfile(await getProfile());
    } catch (error) {
      if (!handleAuthError(error)) setLoadError(errorMessage(error));
    }
  }, [handleAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  // La foto se descarga con la sesión y se comparte con el encabezado (una sola descarga); la caché libera
  // el blob al reemplazarla o al cerrar sesión.
  const userId = session?.user.id;
  const hasPhoto = profile?.hasPhoto ?? false;
  const [photoVersion, setPhotoVersion] = useState(0);
  useEffect(
    () => subscribeProfilePhoto(() => setPhotoVersion((v) => v + 1)),
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: photoVersion fuerza la descarga tras subir una foto nueva.
  useEffect(() => {
    if (!hasPhoto || !userId) return;
    let cancelled = false;
    getProfilePhotoUrlCached(userId, true).then((url) => {
      if (cancelled) return;
      setPhotoUrl(url);
      if (!url) setPhotoError("No se pudo cargar la foto de perfil.");
    });
    return () => {
      cancelled = true;
    };
  }, [hasPhoto, userId, photoVersion]);

  const startEditing = () => {
    if (!profile) return;
    setDraft(toDraft(profile));
    // Un aviso de una operación anterior (foto o guardado) no corresponde a la edición nueva.
    setSaveError("");
    setPhotoError("");
    setNotice("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setDraft(null);
    setSaveError("");
  };

  const handleSave = async () => {
    if (!profile || !draft || saving) return;
    const original = toDraft(profile);
    // Solo se envían los campos que cambiaron; un campo vacío borra el valor (null).
    const changes: Partial<Record<EditableProfileField, string | null>> = {};
    for (const field of EDITABLE_PROFILE_FIELDS) {
      const value = draft[field].trim();
      if (value !== original[field])
        changes[field] = value === "" ? null : value;
    }
    if (Object.keys(changes).length === 0) {
      cancelEditing();
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await updateProfile(changes);
      setProfile(await getProfile());
      setIsEditing(false);
      setDraft(null);
      setPhotoError("");
      setNotice("Cambios guardados");
    } catch (error) {
      if (!handleAuthError(error)) setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoError("");
    setNotice("");
    // Validación previa para avisar antes de subir; el backend valida el contenido real.
    if (!PROFILE_PHOTO_TYPES.includes(file.type))
      return setPhotoError("La foto debe ser una imagen JPEG o PNG.");
    if (file.size > PROFILE_PHOTO_MAX_BYTES)
      return setPhotoError("La foto no puede pesar más de 5 MB.");
    setUploading(true);
    try {
      await uploadProfilePhoto(file);
      setProfile((current) => current && { ...current, hasPhoto: true });
      // Descarta la foto en caché y avisa a la pantalla y al encabezado para que pidan la nueva.
      if (userId) profilePhotoChanged(userId);
      else setPhotoVersion((v) => v + 1);
      setNotice("Foto actualizada");
    } catch (error) {
      if (!handleAuthError(error)) setPhotoError(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const inputClass =
    "text-sm sm:text-base lg:text-[18px] font-light text-[#000000] w-full border-b-2 border-[#7355F7] focus:outline-none bg-white px-2 py-1 rounded";
  const labelClass =
    "text-sm sm:text-base md:text-[18px] font-light text-[#999999]";
  const valueClass =
    "text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words";
  const buttonClass =
    "w-full sm:w-[194px] h-10 sm:h-[38px] bg-transparent border border-gray-400 rounded-lg text-sm sm:text-base font-medium text-[#535353] hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  const editableField = (
    field: EditableProfileField,
    label: string,
    align = "",
  ) => (
    <div className="w-full">
      <label htmlFor={field} className={labelClass}>
        {label}
      </label>
      {isEditing && draft ? (
        <input
          id={field}
          type={field.endsWith("hone") ? "tel" : "text"}
          value={draft[field]}
          onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
          className={`${inputClass} ${align}`}
        />
      ) : (
        <p id={field} className={valueClass}>
          {profile?.[field] || "—"}
        </p>
      )}
    </div>
  );

  const nombre = profile ? `${profile.firstName} ${profile.lastName}` : "";

  return (
    <div className="min-h-screen bg-white pb-8 sm:pb-12">
      {/* HEADER */}
      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 border-b border-gray-200">
        <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex-shrink-0">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={80}
            height={80}
            className="object-contain w-full h-full"
          />
        </div>

        <UserMenu />
      </nav>

      <div className="px-4 sm:px-6 md:px-8 max-w-7xl mx-auto">
        <div className="flex items-start mt-4 sm:mt-6 md:mt-8 lg:mt-10 mb-4 sm:mb-6 md:mb-8 lg:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-medium leading-tight sm:leading-snug lg:leading-[56px] text-[#000000]">
            Mi perfil
          </h1>
        </div>

        {loadError ? (
          <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8">
            <p role="alert" className="text-[#E23A5C] text-[16px]">
              {loadError}
            </p>
            <button
              type="button"
              onClick={load}
              className={`${buttonClass} mt-4`}
            >
              Reintentar
            </button>
          </div>
        ) : !profile ? (
          <p className={labelClass}>Cargando perfil...</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 md:gap-8 lg:gap-12 mb-6 sm:mb-8">
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                <div className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-[191px] lg:h-[191px] rounded-full overflow-hidden">
                  {photoUrl ? (
                    // biome-ignore lint/performance/noImgElement: blob local de una imagen privada; next/image no aplica.
                    <img
                      src={photoUrl}
                      alt="Foto de perfil"
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <UserCircle
                      className="w-full h-full text-[#C9BEFB]"
                      strokeWidth={1}
                    />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handlePhotoChange}
                  className="hidden"
                  data-testid="photo-input"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-sm sm:text-base font-medium text-[#7355F7] hover:underline transition cursor-pointer disabled:opacity-50"
                >
                  {uploading ? "Subiendo foto..." : "Cambiar foto"}
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center sm:items-start gap-4 sm:gap-6 w-full">
                <div className="flex flex-col gap-1 text-center sm:text-left">
                  <h2 className="text-lg sm:text-xl md:text-[20px] font-medium text-[#000000]">
                    {nombre}
                  </h2>
                  <p className="text-sm sm:text-base md:text-[18px] font-light text-[#535353] break-all">
                    {correo}
                  </p>
                  <span className="bg-[#E3DDFD] px-3 sm:px-4 py-1 rounded-lg text-sm sm:text-base md:text-[18px] font-light text-[#000000] inline-block w-fit mx-auto sm:mx-0">
                    Paciente
                  </span>
                </div>

                <div className="flex flex-col gap-3 w-full sm:w-auto sm:ml-auto">
                  <button
                    type="button"
                    onClick={isEditing ? handleSave : startEditing}
                    disabled={saving}
                    className={buttonClass}
                  >
                    {saving
                      ? "Guardando..."
                      : isEditing
                        ? "Guardar cambios"
                        : "Editar perfil"}
                  </button>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={saving}
                      className={buttonClass}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(saveError || photoError) && (
              <p role="alert" className="text-[#E23A5C] text-[14px] mb-4">
                {saveError || photoError}
              </p>
            )}
            {notice && (
              <output className="block text-[#664BDB] text-[14px] mb-4">
                {notice}
              </output>
            )}

            {/* Información personal */}
            <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-medium text-[#000000] mb-4 sm:mb-6">
                Información personal
              </h3>

              <div className="flex flex-col md:flex-row justify-between gap-4 sm:gap-6">
                <div className="flex flex-col gap-3 sm:gap-4 flex-1">
                  <div>
                    <p className={labelClass}>Nombre:</p>
                    <p className={valueClass}>{nombre}</p>
                  </div>
                  <div>
                    <p className={labelClass}>CURP:</p>
                    <p className={valueClass}>{profile.curp}</p>
                  </div>
                  {editableField("phone", "Número:")}
                  {editableField("address", "Dirección:")}
                </div>

                <div className="flex flex-col gap-3 sm:gap-4 flex-1 md:items-end md:text-right">
                  <div className="w-full">
                    <p className={labelClass}>Fecha de nacimiento:</p>
                    <p className={valueClass}>
                      {formatBirthDate(profile.birthDate) || "—"}
                    </p>
                  </div>
                  {editableField(
                    "emergencyContactName",
                    "Contacto de emergencia:",
                    "md:text-right",
                  )}
                  {editableField(
                    "emergencyContactPhone",
                    "Teléfono del contacto de emergencia:",
                    "md:text-right",
                  )}
                </div>
              </div>
            </div>

            {/* Seguridad */}
            <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8">
              <h3 className="text-base sm:text-lg font-medium text-[#000000] mb-4 sm:mb-6">
                Seguridad
              </h3>

              <div className="flex flex-col gap-3 sm:gap-6">
                <div>
                  <p className={labelClass}>Correo electrónico:</p>
                  <p className={`${valueClass} break-all`}>{correo}</p>
                  <p className="text-[13px] text-[#999999] mt-1">
                    El correo no se puede cambiar desde la aplicación.
                  </p>
                </div>
                <div className="flex flex-col md:flex-row justify-between gap-3">
                  <div>
                    <p className={labelClass}>Contraseña:</p>
                    <p className={valueClass}>**********</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNotice("");
                      setPasswordOpen(true);
                    }}
                    className="text-sm sm:text-base md:text-[18px] font-medium text-[#7355F7] hover:underline transition md:text-right cursor-pointer w-fit md:w-auto"
                  >
                    Cambiar
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {passwordOpen && (
        <ChangePasswordModal
          onClose={() => setPasswordOpen(false)}
          onChanged={() => {
            setPasswordOpen(false);
            setNotice("Contraseña actualizada");
          }}
        />
      )}
    </div>
  );
}

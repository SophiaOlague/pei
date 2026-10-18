"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [nombre, setNombre] = useState("Usuario 1");
  const [numero, setNumero] = useState("6182605168");
  const [direccion, setDireccion] = useState("Itrio #210 Luis Manuel Dgo.");
  const [fechaNacimiento, setFechaNacimiento] = useState("7 de agosto, 2005");
  const [contactoEmergencia, setContactoEmergencia] = useState("Jose Manuel 6182506068");
  const [correo, setCorreo] = useState("Osc2@gmail.com");

  const [modalOpen, setModalOpen] = useState<"correo" | "password" | null>(null);
  const [newCorreo, setNewCorreo] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSave = () => {
    setIsEditing(false);
    alert("Cambios guardados");
  };

  const handleChangeCorreo = () => {
    if (!newCorreo) {
      alert("Por favor, ingresa el nuevo correo");
      return;
    }
    setCorreo(newCorreo);
    setNewCorreo("");
    setModalOpen(null);
    alert("Correo actualizado correctamente");
  };

  const handleChangePassword = () => {
    if (!newPassword || !confirmPassword) {
      alert("Por favor, completa todos los campos");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setModalOpen(null);
    alert("Contraseña actualizada correctamente");
  };

  const inputClass =
    "text-sm sm:text-base lg:text-[18px] font-light text-[#000000] w-full border-b-2 border-[#7355F7] focus:outline-none bg-white px-2 py-1 rounded";

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

        
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 md:gap-8 lg:gap-12 mb-6 sm:mb-8">
          <div className="flex-shrink-0">
            <div className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-[191px] lg:h-[191px] rounded-full overflow-hidden">
              <Image
                src="/perfil-usuario.png"
                alt="Foto de perfil"
                width={191}
                height={191}
                className="object-cover w-full h-full"
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center sm:items-start gap-4 sm:gap-6 w-full">
            <div className="flex flex-col gap-1 text-center sm:text-left">
              <h2 className="text-lg sm:text-xl md:text-[20px] font-medium text-[#000000]">Oscar</h2>
              <p className="text-sm sm:text-base md:text-[18px] font-light text-[#535353] break-all">{correo}</p>
              <p className="text-sm sm:text-base md:text-[18px] font-light text-[#535353]">ID: 12548967</p>
              <span className="bg-[#E3DDFD] px-3 sm:px-4 py-1 rounded-lg text-sm sm:text-base md:text-[18px] font-light text-[#000000] inline-block w-fit mx-auto sm:mx-0">
                Paciente
              </span>
            </div>

            <div className="flex flex-col gap-3 w-full sm:w-auto sm:ml-auto">
              <a
                href="/historial-medico"
                className="w-full sm:w-[194px] h-10 sm:h-[38px] bg-[#7355F7] rounded-lg text-sm sm:text-base font-medium text-white hover:bg-[#6244d9] transition cursor-pointer flex items-center justify-center"
              >
                Ir a mis citas
              </a>
              <button
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                className="w-full sm:w-[194px] h-10 sm:h-[38px] bg-transparent border border-gray-400 rounded-lg text-sm sm:text-base font-medium text-[#535353] hover:bg-gray-50 transition cursor-pointer"
              >
                {isEditing ? "Guardar cambios" : "Editar perfil"}
              </button>
            </div>
          </div>
        </div>

        {/* Información personal */}
        <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6">
          <h3 className="text-base sm:text-lg font-medium text-[#000000] mb-4 sm:mb-6">
            Información personal
          </h3>

          <div className="flex flex-col md:flex-row justify-between gap-4 sm:gap-6">
            <div className="flex flex-col gap-3 sm:gap-4 flex-1">
              <div>
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#999999]">Nombre:</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <p className="text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words">{nombre}</p>
                )}
              </div>
              <div>
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#999999]">Número:</p>
                {isEditing ? (
                  <input
                    type="tel"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <p className="text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words">{numero}</p>
                )}
              </div>
              <div>
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#999999]">Dirección:</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <p className="text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words">{direccion}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:gap-4 flex-1 md:items-end md:text-right">
              <div className="w-full">
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#999999]">
                  Fecha de nacimiento:
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={fechaNacimiento}
                    onChange={(e) => setFechaNacimiento(e.target.value)}
                    className={`${inputClass} md:text-right`}
                  />
                ) : (
                  <p className="text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words">
                    {fechaNacimiento}
                  </p>
                )}
              </div>
              <div className="w-full">
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#999999]">
                  Contacto de emergencia:
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={contactoEmergencia}
                    onChange={(e) => setContactoEmergencia(e.target.value)}
                    className={`${inputClass} md:text-right`}
                  />
                ) : (
                  <p className="text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words">
                    {contactoEmergencia}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Seguridad */}
        <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8">
          <h3 className="text-base sm:text-lg font-medium text-[#000000] mb-4 sm:mb-6">Seguridad</h3>

          <div className="flex flex-col md:flex-row justify-between gap-4 sm:gap-6">
            <div className="flex flex-col gap-3 sm:gap-6 flex-1">
              <div>
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#999999]">
                  Correo electrónico:
                </p>
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-all">{correo}</p>
              </div>
              <div>
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#999999]">Contraseña:</p>
                <p className="text-sm sm:text-base md:text-[18px] font-light text-[#000000]">**********</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:gap-6 flex-1 md:items-end">
              <button
                onClick={() => setModalOpen("correo")}
                className="text-sm sm:text-base md:text-[18px] font-medium text-[#7355F7] hover:underline transition md:text-right md:mt-6 cursor-pointer w-fit md:w-auto"
              >
                Cambiar
              </button>
              <button
                onClick={() => setModalOpen("password")}
                className="text-sm sm:text-base md:text-[18px] font-medium text-[#7355F7] hover:underline transition md:text-right cursor-pointer w-fit md:w-auto"
              >
                Cambiar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOpen(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 md:p-8 w-full max-w-[500px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl md:text-[22px] font-medium text-black">
                {modalOpen === "correo" ? "Cambiar correo" : "Cambiar contraseña"}
              </h3>
              <button
                onClick={() => setModalOpen(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5 text-[#535353]" />
              </button>
            </div>

            {modalOpen === "correo" && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm sm:text-base text-[#535353] block mb-2">
                    Nuevo correo electrónico
                  </label>
                  <input
                    type="email"
                    value={newCorreo}
                    onChange={(e) => setNewCorreo(e.target.value)}
                    placeholder="nuevo@correo.com"
                    className="w-full h-12 sm:h-[50px] px-4 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:border-[#7355F7]"
                  />
                </div>
                <button
                  onClick={handleChangeCorreo}
                  className="w-full h-12 sm:h-[50px] bg-[#7355F7] rounded-lg text-white text-sm sm:text-base font-medium hover:bg-[#6244d9] transition mt-2 cursor-pointer"
                >
                  Guardar cambio
                </button>
              </div>
            )}

            {modalOpen === "password" && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm sm:text-base text-[#535353] block mb-2">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full h-12 sm:h-[50px] px-4 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:border-[#7355F7]"
                  />
                </div>
                <div>
                  <label className="text-sm sm:text-base text-[#535353] block mb-2">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full h-12 sm:h-[50px] px-4 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:border-[#7355F7]"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  className="w-full h-12 sm:h-[50px] bg-[#7355F7] rounded-lg text-white text-sm sm:text-base font-medium hover:bg-[#6244d9] transition mt-2 cursor-pointer"
                >
                  Guardar cambio
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
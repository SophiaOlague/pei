export interface SubPruebaResultado {
  categoria: "FUERA_RANGO" | "SUFICIENTE" | "OPTIMO";
  explicacionClinica: string;
  maxVal: number;
  minVal: number;
  nombreAnalisis: string;
  posicionPorcentaje: number;
  subId: string;
  unidad: string;
  valor: number;
}

export interface LoteLaboratorio {
  fechaActualizacion: string;
  idPrincipal: string;
  pruebas: SubPruebaResultado[];
  scoreGeneral: number;
  tituloLote: string;
}
export interface HistorialLabItem {
  fecha: string;
  id: string;
  nombrePrueba: string;
}

const DUMMY_LOTES: LoteLaboratorio[] = [
  {
    fechaActualizacion: "20/09/2026",
    idPrincipal: "lote-pdf-001",
    pruebas: [
      {
        categoria: "FUERA_RANGO",
        explicacionClinica:
          "El nivel de monocitos se encuentra ligeramente por encima del rango de referencia estándar.",
        maxVal: 8.0,
        minVal: 2.0,
        nombreAnalisis: "% de monocitos",
        posicionPorcentaje: 82,
        subId: "sub-101",
        unidad: "%",
        valor: 9.5,
      },
      {
        categoria: "FUERA_RANGO",
        explicacionClinica:
          "Indicador enzimático hepático elevado. Se sugiere evaluación médica preventiva.",
        maxVal: 56.0,
        minVal: 7.0,
        nombreAnalisis: "Alanina aminota",
        posicionPorcentaje: 88,
        subId: "sub-102",
        unidad: "UL",
        valor: 73.0,
      },
      {
        categoria: "SUFICIENTE",
        explicacionClinica:
          "El nivel de colesterol LDL está en un rango aceptable pero cercano al límite.",
        maxVal: 129.0,
        minVal: 0,
        nombreAnalisis: "Colesterol LDL",
        posicionPorcentaje: 58,
        subId: "sub-103",
        unidad: "mg/dL",
        valor: 110.0,
      },
      {
        categoria: "FUERA_RANGO",
        explicacionClinica:
        "El nivel de triglicéridos se encuentra elevado respecto al límite de referencia estándar (150 mg/dL). Se recomienda evaluación médica y ajuste en la dieta.",
        maxVal: 150.0,
        minVal: 0,
        nombreAnalisis: "Triglicéridos",
        posicionPorcentaje: 88,
        subId: "sub-104",
        unidad: "mg/dL",
        valor: 210.0,
      },
    ],
    scoreGeneral: 53,
    tituloLote: "Análisis de Sangre General",
  },
  {
    fechaActualizacion: "10 de octubre 2026",
    idPrincipal: "lote-pdf-002",
    pruebas: [
      {
        categoria: "FUERA_RANGO",
        explicacionClinica:
          "El nivel de glucosa está por encima del rango saludable, lo que puede indicar resistencia a la insulina y un aumento de azúcar en la sangre.",
        maxVal: 99.0,
        minVal: 70.0,
        nombreAnalisis: "Glucosa en ayunas",
        posicionPorcentaje: 75,
        subId: "sub-201",
        unidad: "mg/dL",
        valor: 119.0,
      },
    ],
    scoreGeneral: 88,
    tituloLote: "Química Sanguínea 6 Elementos",
  },
  {
    fechaActualizacion: "01 de junio 2026",
    idPrincipal: "lote-pdf-003",
    pruebas: [
      {
        categoria: "OPTIMO",
        explicacionClinica:
          "Parámetros totalmente óptimos en relación con su perfil histórico.",
        maxVal: 200.0,
        minVal: 100.0,
        nombreAnalisis: "Colesterol Total",
        posicionPorcentaje: 25,
        subId: "sub-301",
        unidad: "mg/dL",
        valor: 165.0,
      },
    ],
    scoreGeneral: 95,
    tituloLote: "Perfil Lipídico Anual",
  },
];

export const ServiceLaboratorio = {
  async obtenerHistorialResumido(): Promise<HistorialLabItem[]> {
    await new Promise((r) => setTimeout(r, 300));
    return DUMMY_LOTES.map((lote) => ({
      fecha: lote.fechaActualizacion,
      id: lote.idPrincipal,
      nombrePrueba: lote.tituloLote,
    }));
  },

  async obtenerLotePorId(loteId: string): Promise<LoteLaboratorio> {
    await new Promise((r) => setTimeout(r, 200));
    return DUMMY_LOTES.find((l) => l.idPrincipal === loteId) || DUMMY_LOTES[0];
  },

  async obtenerPruebaEspecifica(
    loteId: string,
    subId: string
  ): Promise<SubPruebaResultado | null> {
    await new Promise((r) => setTimeout(r, 200));
    const lote =
      DUMMY_LOTES.find((l) => l.idPrincipal === loteId) || DUMMY_LOTES[0];
    return lote.pruebas.find((p) => p.subId === subId) || lote.pruebas[0];
  },
};
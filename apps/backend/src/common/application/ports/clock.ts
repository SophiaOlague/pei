// Fuente de la hora actual. Las reglas que dependen del tiempo (retención de 5 minutos,
// plazos de 24 horas, ventanas de espera) la reciben por este puerto para poder probarse
// con una hora fija.

export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

// Internal mapping helpers for `prescriberx-encounter-types.ts`.
//
// Splits raw upstream shapes and the raw->public mappers out of the main
// client to keep each file under our 250-line cap. Public exported types
// (EncounterType, EncounterTypeField, EncounterTypeStep, EncounterTypeSchema)
// also live here so callers can import them from either module.

export interface EncounterType {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  product_class: string | null
  product_type: string | null
  is_featured: boolean
  requires_labs: boolean
  interaction_type: string | null
}

export interface EncounterTypeField {
  slug: string
  label: string
  field_type: number
  field_type_label: string | null
  is_required: boolean
  help_text: string | null
  placeholder: string | null
  validation: string[]
  maps_to: string | null
}

export interface EncounterTypeStep {
  step_name: string
  step_description: string | null
  step_type: number
  display_order: number
  is_required: boolean
  fields: EncounterTypeField[]
}

export interface EncounterTypeSchema {
  encounter_type: {
    id: string
    name: string
    slug: string
    description: string | null
  }
  steps: EncounterTypeStep[]
}

export interface RawEncounterType {
  id: string
  name: string
  slug: string
  description?: string | null
  icon?: string | null
  product_class?: string | null
  product_type?: string | null
  is_featured?: boolean | null
  requires_labs?: boolean | null
  interaction_type?: string | null
}

export interface RawField {
  slug: string
  label: string
  field_type?: number | null
  field_type_label?: string | null
  is_required?: boolean | null
  help_text?: string | null
  placeholder?: string | null
  validation?: string[] | null
  maps_to?: string | null
}

export interface RawStep {
  step_name: string
  step_description?: string | null
  step_type?: number | null
  display_order?: number | null
  is_required?: boolean | null
  fields?: RawField[] | null
}

export interface RawSchema {
  encounter_type: {
    id: string
    name: string
    slug: string
    description?: string | null
  }
  steps?: RawStep[] | null
}

export interface ListEnvelope {
  data: RawEncounterType[]
}

export interface SchemaEnvelope {
  data: RawSchema
}

export function mapEncounterType(raw: RawEncounterType): EncounterType {
  return {
    id: raw.id,
    name: (raw.name ?? '').trim(),
    slug: raw.slug,
    description: raw.description ?? null,
    icon: raw.icon ?? null,
    product_class: raw.product_class ?? null,
    product_type: raw.product_type ?? null,
    is_featured: Boolean(raw.is_featured),
    requires_labs: Boolean(raw.requires_labs),
    interaction_type: raw.interaction_type ?? null,
  }
}

function mapField(raw: RawField): EncounterTypeField {
  return {
    slug: raw.slug,
    label: raw.label,
    field_type: typeof raw.field_type === 'number' ? raw.field_type : 0,
    field_type_label: raw.field_type_label ?? null,
    is_required: Boolean(raw.is_required),
    help_text: raw.help_text ?? null,
    placeholder: raw.placeholder ?? null,
    validation: Array.isArray(raw.validation) ? raw.validation : [],
    maps_to: raw.maps_to ?? null,
  }
}

function mapStep(raw: RawStep): EncounterTypeStep {
  return {
    step_name: raw.step_name,
    step_description: raw.step_description ?? null,
    step_type: typeof raw.step_type === 'number' ? raw.step_type : 0,
    display_order: typeof raw.display_order === 'number' ? raw.display_order : 0,
    is_required: Boolean(raw.is_required),
    fields: (raw.fields ?? []).map(mapField),
  }
}

export function mapSchema(raw: RawSchema): EncounterTypeSchema {
  return {
    encounter_type: {
      id: raw.encounter_type.id,
      name: (raw.encounter_type.name ?? '').trim(),
      slug: raw.encounter_type.slug,
      description: raw.encounter_type.description ?? null,
    },
    steps: (raw.steps ?? [])
      .map(mapStep)
      .sort((a, b) => a.display_order - b.display_order),
  }
}

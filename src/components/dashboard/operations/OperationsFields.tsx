/**
 * Operations-facing names for the shared register primitives.
 *
 * These live in `RegisterFields` because Commercial Farming's seven registers
 * are the same components and a second copy would drift. This file only keeps
 * the existing Operations call sites readable.
 */
export {
  Checkbox as OpsCheckbox,
  Fieldset as OpsFieldset,
  NumberField as OpsNumberField,
  Readout as OpsReadout,
  RecordTable as OpsRecordTable,
  SelectField as OpsSelectField,
  TextArea as OpsTextArea,
  TextField as OpsTextField,
} from "../RegisterFields";

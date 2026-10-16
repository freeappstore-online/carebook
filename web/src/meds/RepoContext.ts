import { createContext, useContext } from 'react'
import { type MedicationRepository, medicationRepo } from './repository'

/** The repository screens read and write. Tests provide their own. */
export const MedicationRepoContext = createContext<MedicationRepository>(medicationRepo)

export const useMedicationRepo = () => useContext(MedicationRepoContext)

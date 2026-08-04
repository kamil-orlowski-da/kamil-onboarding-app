// The vehicle leasing party registry: who exists, and registering more of them.
//
// Unauthenticated on the backend, so this store works before anyone has logged in —
// which it must, since the registry starts empty and a party-picker has to list who
// exists.
//
// Every registration re-reads the list from the server rather than patching local state
// from the response. That is the habit to keep once leasing contracts arrive: another
// party can change things underneath you, and a write tells you what one operation did,
// not what the state now is.

import React, { createContext, useContext, useState, useCallback } from 'react'
import { useToast } from './toastStore'
import api from '../api.ts'
import type {
    Actor,
    Client,
    CreateCarDealerRequest,
    CreateCustomerRequest,
    CreateLeasingCompanyRequest,
} from '../openapi.d.ts'
import { useErrorHandling } from '../utils/error'

interface PartyState {
    actors: Actor[]
}

interface PartyContextType extends PartyState {
    fetchActors: () => Promise<void>
    createCarDealer: (request: CreateCarDealerRequest) => Promise<void>
    createLeasingCompany: (request: CreateLeasingCompanyRequest) => Promise<void>
    createCustomer: (request: CreateCustomerRequest) => Promise<void>
}

interface PartyProviderProps {
    children: React.ReactNode
}

const PartyContext = createContext<PartyContextType | undefined>(undefined)

export const PartyProvider = ({ children }: PartyProviderProps) => {
    const [actors, setActors] = useState<Actor[]>([])
    const toast = useToast()

    const fetchActors = useCallback(
        useErrorHandling(`Fetching Parties`)(async () => {
            const client: Client = await api.getClient()
            const response = await client.listActors()
            setActors(response.data)
        }),
        [setActors]
    )

    // The three registrations differ only in which client method they call, so they share
    // this. `useErrorHandling` swallows the rejection and toasts it, which is why the
    // caller cannot tell success from failure by "it returned" — hence the re-read.
    const register = useCallback(
        async (name: string, call: (client: Client) => Promise<unknown>) => {
            await call(await api.getClient())
            await fetchActors()
            toast.displaySuccess(`Registered ${name}`)
        },
        [fetchActors, toast]
    )

    const createCarDealer = useCallback(
        useErrorHandling(`Registering Car Dealer`)((request: CreateCarDealerRequest) =>
            register(request.name, (client) => client.createCarDealer(null, request))
        ),
        [register]
    )

    const createLeasingCompany = useCallback(
        useErrorHandling(`Registering Leasing Company`)((request: CreateLeasingCompanyRequest) =>
            register(request.name, (client) => client.createLeasingCompany(null, request))
        ),
        [register]
    )

    const createCustomer = useCallback(
        useErrorHandling(`Registering Customer`)((request: CreateCustomerRequest) =>
            register(request.name, (client) => client.createCustomer(null, request))
        ),
        [register]
    )

    return (
        <PartyContext.Provider
            value={{
                actors,
                fetchActors,
                createCarDealer,
                createLeasingCompany,
                createCustomer,
            }}
        >
            {children}
        </PartyContext.Provider>
    )
}

export const usePartyStore = () => {
    const context = useContext(PartyContext)
    if (context === undefined) {
        throw new Error('usePartyStore must be used within a PartyProvider')
    }
    return context
}

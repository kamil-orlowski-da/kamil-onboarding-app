// The vehicle leasing party registry: register the three kinds of party, and see who
// exists.
//
// Reachable without logging in on purpose — the registry starts empty, so putting
// registration behind a login would deadlock. Registering a party is not logging in as
// one: identity comes from the quickstart's own login (Keycloak in oauth2 mode, the
// shared-secret form otherwise), and this screen only says what part a party plays in the
// leasing story. The row belonging to the party you are logged in as is marked, which is
// how the two halves visibly meet.
//
// The real flow replaces this screen's write half: parties administered through the
// tenant registrations rather than invented by a form. What survives is the read half and
// the shape — the frontend asks the backend who exists and never handles a credential.

import React, { useEffect, useState } from 'react'
import { usePartyStore } from '../stores/partyStore'
import { useUserStore } from '../stores/userStore'
import { ROLE_LABELS } from '../roles'
import { formatDateTime } from '../utils/format'

// A name, and optionally the party id to attach the role to, so one form serves all three
// roles. A role that grows a field of its own wants its own form rather than a third prop
// bolted onto this one.
const RegisterForm: React.FC<{
    title: string
    placeholder: string
    /** The logged-in party, if any — offered as the party to register. */
    ownParty?: string
    onSubmit: (name: string, party?: string) => Promise<void>
}> = ({ title, placeholder, ownParty, onSubmit }) => {
    const [name, setName] = useState('')
    const [useOwnParty, setUseOwnParty] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (name.trim() === '' || submitting) return
        setSubmitting(true)
        try {
            await onSubmit(name, useOwnParty ? ownParty : undefined)
            // Cleared unconditionally: `withErrorHandling` in the store swallows the
            // rejection to toast it, so there is nothing here to tell success from a
            // duplicate name. The table below is the source of truth either way.
            setName('')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="col">
            <div className="mb-3">
                <label htmlFor={`name-${title}`} className="form-label">
                    {title}
                </label>
                <input
                    type="text"
                    id={`name-${title}`}
                    name="name"
                    className="form-control"
                    placeholder={placeholder}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
            </div>
            {/*
                Only when logged in, because there is otherwise no party to offer. Ticking it
                is what makes the registry entry describe *you*: the backend then reports this
                role on `/user`, and the row below is marked. Left unticked, the entry gets a
                made-up id belonging to nobody.
            */}
            {ownParty !== undefined && (
                <div className="form-check mb-3">
                    <input
                        type="checkbox"
                        className="form-check-input"
                        id={`own-party-${title}`}
                        checked={useOwnParty}
                        onChange={(e) => setUseOwnParty(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor={`own-party-${title}`}>
                        This is me (<code>{ownParty}</code>)
                    </label>
                </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Registering…' : 'Register'}
            </button>
        </form>
    )
}

const PartiesView: React.FC = () => {
    const { actors, fetchActors, createCarDealer, createLeasingCompany, createCustomer } =
        usePartyStore()
    const { user } = useUserStore()
    const ownParty = user?.party

    useEffect(() => {
        fetchActors()
    }, [fetchActors])

    return (
        <div>
            <h2>Vehicle Leasing Parties</h2>
            <p>
                A car dealer supplies the vehicle, a leasing company finances it, a customer
                leases it. The leasing workflow between them does not exist yet — this is the
                registry of who could take part.
            </p>

            <h3>Register</h3>
            <div className="row">
                <RegisterForm
                    title="Car dealer"
                    placeholder="Acme Motors"
                    ownParty={ownParty}
                    onSubmit={(name, party) => createCarDealer({ name, party })}
                />
                <RegisterForm
                    title="Leasing company"
                    placeholder="Northern Leasing AG"
                    ownParty={ownParty}
                    onSubmit={(name, party) => createLeasingCompany({ name, party })}
                />
                <RegisterForm
                    title="Customer"
                    placeholder="Jamie Fletcher"
                    ownParty={ownParty}
                    onSubmit={(name, party) => createCustomer({ name, party })}
                />
            </div>

            <div className="mt-4">
                <h3>Registered</h3>
                {actors.length === 0 ? (
                    <p>Nobody registered yet — register someone above.</p>
                ) : (
                    <table className="table nowrap">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Party</th>
                                <th>Registered</th>
                            </tr>
                        </thead>
                        <tbody>
                            {actors.map((actor) => (
                                <tr key={actor.party}>
                                    <td>
                                        {actor.name}
                                        {user?.party === actor.party && (
                                            <span className="fw-bold"> — you</span>
                                        )}
                                    </td>
                                    <td>{ROLE_LABELS[actor.role]}</td>
                                    <td>
                                        <code>{actor.party}</code>
                                    </td>
                                    <td>{formatDateTime(actor.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

export default PartiesView

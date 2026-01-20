import type { AetheriumConfig, ToolsDef } from '../types.ts'
import { getConfig } from '../utils/config.ts'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'
import logger from '../utils/logger.ts'
import z from 'zod'

type OsintMcpInput = { 
    name?: string
    phoneNumber?: string
    email?: string,
    username?: string
}


async function searchUsernames(username: string) {

    // implement basic version of maigret




}




async function osintResearchHandler(osintInput: OsintMcpInput, config: AetheriumConfig, abortSignal: AbortSignal): Promise<CallToolResult> {
    logger.info({ 
        message: `OSINT research called`,
        osintInput
    })

    const promises = []

    // if name
    // look up name

    // if email
    // look up emails (aliases on sites)
    // havibeenpwned

    if (osintInput.username) {
        promises.push(searchUsernames(osintInput.username.trim()))
    }

    // if phone number
    // etc



    // goal of this is to look up people and return lists of
    // socials, emails, aliases, linkedin, blogs, etc





    return {
        content: [{ type: 'text', text: 'todo' }]
    }
}

export function buildTimeTool(): ToolsDef {
    return {
        name: 'osint-researcher',
        config: {
            title: 'OSINT Researcher',
            description: 'Research people or businesses',
            inputSchema: {
                inputSchema: {
                    name: z.optional(
                        z.string({ description: 'Name of person' })
                    ),
                    phoneNumber: z.optional(
                        z.string({ description: 'Phone number of person'})
                    ),
                    email: z.optional(
                        z.string({ description: 'Email of person'}).email()
                    ),
                    username: z.optional(
                        z.string({ description: 'Username' })
                    ),
                }
            },
            annotations: {
                title: 'OSINT Research',
                readOnlyHint: true,
                openWorldHint: true
            } 
        },
        handler: async (osintArgs: OsintMcpInput, abortSignal: AbortSignal) => {
            const config = getConfig()
            return osintResearchHandler(osintArgs, config, abortSignal)
        },
    }
}




import { BaseService } from './base.service.js';
import { ChatService } from './chat.service.js';
import { GroupService } from './group.service.js';
import { MessageService } from './message.service.js';
import { Chat, ChatMember, Message, MessageType, UserRole } from '../types/protocol.js';

export class ChannelService {
    private static async ensureChannel(channelId: string, userId: string): Promise<void> {
        const chat = BaseService.queryOne<{ type: string }>(
            `SELECT type FROM chats WHERE id = ?`,
            [channelId]
        );

        if (!chat || chat.type !== 'CHANNEL') {
            throw new Error('Channel not found');
        }

        if (!ChatService.isChatMember(channelId, userId)) {
            throw new Error('You are not a member of this channel');
        }
    }

    private static async assertChannelAdmin(channelId: string, actorId: string): Promise<void> {
        const member = BaseService.queryOne<{ role: string }>(
            `
            SELECT cm.role
            FROM chat_members cm
            JOIN chats c ON c.id = cm.chat_id
            WHERE cm.chat_id = ?
              AND cm.user_id = ?
              AND c.type = 'CHANNEL'
            `,
            [channelId, actorId]
        );

        if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
            throw new Error('Only channel owners or admins can perform this action');
        }
    }

    static async createChannel(params: {
        ownerId: string;
        name: string;
        description?: string;
        photoUrl?: string;
        memberIds?: string[];
    }): Promise<Chat> {
        return GroupService.createGroup({
            creatorId: params.ownerId,
            title: params.name,
            description: params.description,
            avatarUrl: params.photoUrl,
            type: 'CHANNEL',
            memberIds: params.memberIds,
        });
    }

    static async getUserChannels(userId: string): Promise<Chat[]> {
        return (await ChatService.getUserChats(userId)).filter((chat) => chat.type === 'CHANNEL');
    }

    static async getChannelMembers(channelId: string, userId: string): Promise<ChatMember[]> {
        await this.ensureChannel(channelId, userId);
        return ChatService.getChatMembers(channelId);
    }

    static async addMember(
        channelId: string,
        userId: string,
        role: UserRole,
        actorId: string
    ): Promise<Chat> {
        await this.assertChannelAdmin(channelId, actorId);
        return GroupService.addMember(channelId, userId, role);
    }

    static async removeMember(channelId: string, userId: string, actorId: string): Promise<void> {
        await this.assertChannelAdmin(channelId, actorId);
        GroupService.removeMember(channelId, userId);
    }

    static async leaveChannel(channelId: string, userId: string): Promise<void> {
        await this.ensureChannel(channelId, userId);
        GroupService.removeMember(channelId, userId);
    }

    static async getChannelInfo(channelId: string, userId: string): Promise<Chat | null> {
        await this.ensureChannel(channelId, userId);
        return ChatService.getChatById(channelId, userId);
    }

    static async getChannelMessages(
        channelId: string,
        userId: string,
        limit = 50,
        before?: string
    ): Promise<Message[]> {
        await this.ensureChannel(channelId, userId);
        return MessageService.getChatMessages(channelId, limit, before, userId);
    }

    static async sendMessageToChannel(
        channelId: string,
        userId: string,
        content: string,
        type: MessageType = 'TEXT'
    ): Promise<Message> {
        await this.assertChannelAdmin(channelId, userId);
        return MessageService.createMessage({
            chatId: channelId,
            senderId: userId,
            contentText: content,
            type,
        });
    }
}

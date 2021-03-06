import EscalationLogic from '@/services/EscalationLogic';
import RequestMessage from '@/interfaces/RequestMessage';
import MessageModel from '@/models/message';
import Message from '@/interfaces/Message';
import mongoose from 'mongoose';
import axios from 'axios';
import UserResource from '@/interfaces/UserResource';
import Callback from '@/interfaces/Callback';
import logger from '@/helper/logger';

const UNREAD_MESSAGES_BY_USER = (userId: string) => {
	return {
		$and: [{ 'receivers.userId': { $in: userId } }, { 'seenCallback.userId': { $nin: userId } }],
	};
};

export default class MessageService {
	// region public static methods
	// endregion

	// region private static methods
	private static async save(message: RequestMessage): Promise<string> {
		const messageModel = new MessageModel({
			platform: message.platform,
			template: message.template,
			sender: {
				name: message.sender ? message.sender.name : '',
				mail: message.sender ? message.sender.mail : '',
			},
			payload: message.payload,
			languagePayloads: message.languagePayloads,
			receivers: typeof message.receivers === 'string' ? [] : message.receivers,
			trackLinks: message.trackLinks ? message.trackLinks : true,
		});

		const savedMessage = await messageModel.save();

		if (typeof message.receivers === 'string') {
			// FIXME test class scope working here
			await MessageService.updateReceivers(savedMessage.id, message.receivers);
		}

		return savedMessage.id;
	}

	private static async updateReceivers(messageId: string, url: string) {
		let pageUrl: string = url;

		do {
			const response = await axios.get(pageUrl);
			if (!response.data.data) {
				return;
			}

			await MessageModel.findOneAndUpdate(
				{ _id: messageId },
				{ $addToSet: { receivers: { $each: response.data.data } } },
				{ upsert: true }
			);

			pageUrl = response.data.links.next;
		} while (pageUrl);
	}

	private static async messageSeen(messageId: string, userId: mongoose.Types.ObjectId) {
		const databaseMessage = await MessageModel.findById(messageId);
		if (!databaseMessage) {
			const errorMessage = `Message (id: ${messageId}) not found.`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
		const message = databaseMessage.toObject();
		if (
			!message.receivers ||
			message.receivers.filter((receiver: UserResource) => receiver.userId.equals(userId)).length === 0
		) {
			const errorMessage = `Could not find Receiver in Message`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}
		if (message.seenCallback.filter((cb: Callback) => cb.userId.equals(userId)).length === 0) {
			databaseMessage.seenCallback.push({ userId });
			return await databaseMessage.save();
		}
		return message;
	}

	private static async removeReceiverFromMessage(messageId: string, userId: string): Promise<Message> {
		const message = await MessageModel.findById(messageId);
		if (!message) {
			const errorMessage = `Message (id: ${messageId}) not found.`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const user = message.receivers.find((receiver) => receiver.userId.equals(userId));
		if (!user) {
			const errorMessage = `User (userId: ${userId}) not found in Message (id: ${messageId}).`;
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		message.receivers.pull(user);

		const seenCallback = message.seenCallback.find((callback) => callback.userId.equals(userId));
		if (seenCallback) {
			message.seenCallback.pull(seenCallback);
		}

		return await message.save();
	}

	private static async removeAllMessagesFrom(userId: string): Promise<Message[]> {
		const messageIds = await MessageModel.find({ 'receivers.userId': { $in: userId } })
			.select({ _id: 1 })
			.exec();
		const chain: Array<Promise<Message>> = [];
		if (messageIds && messageIds.length !== 0) {
			messageIds.forEach((m) => chain.push(this.removeReceiverFromMessage(m._id.toString(), userId)));
		}
		return await Promise.all(chain);
	}

	private static async readAllMessagesFrom(userId: string): Promise<Message[]> {
		const messageIds = await MessageModel.find(UNREAD_MESSAGES_BY_USER(userId)).select({ _id: 1 }).exec();
		const chain: Array<Promise<Message>> = [];
		if (messageIds && messageIds.length !== 0) {
			messageIds.forEach((m) => chain.push(this.messageSeen(m._id.toString(), mongoose.Types.ObjectId(userId))));
		}
		return await Promise.all(chain);
	}

	/**
	 * populates and cleanup message from other users data like other receivers or callbacks
	 * @param message
	 * @param userId
	 */
	private static filter(message: Message, userId: mongoose.Types.ObjectId) {
		// FIXME decorator pattern?
		const uid = userId.toString();
		message.receivers = message.receivers.filter((receiver) => receiver.userId.toString() === uid);
		message.seenCallback = message.seenCallback.filter((callback) => callback.userId.toString() === uid);
		return message;
	}

	private static async messagesByUser(userId: mongoose.Types.ObjectId, limit: number, skip: number) {
		const messages = await MessageModel.find({
			'receivers.userId': { $in: userId },
		})
			.sort('-createdAt')
			.skip(skip)
			.limit(limit)
			.exec();
		if (messages && messages.length !== 0) {
			return messages.map((message) => this.filter(message.toObject(), userId));
		}
		return [];
	}

	private static async messageByUserAndMessageId(userId: mongoose.Types.ObjectId, messageId: mongoose.Types.ObjectId) {
		const message = await MessageModel.findOne({
			$and: [{ _id: { $eq: messageId } }, { 'receivers.userId': { $in: userId } }],
		}).exec();
		if (message === null) {
			return message;
		}
		return this.filter(message.toObject(), userId);
	}

	private static async unreadMessagesByUser(userId: mongoose.Types.ObjectId) {
		const amount = await MessageModel.count(UNREAD_MESSAGES_BY_USER(userId.toString())).exec();
		return amount;
	}

	private static async countMessagesByUser(userId: mongoose.Types.ObjectId) {
		const amount = await MessageModel.count({
			'receivers.userId': { $in: userId },
		}).exec();
		return amount;
	}

	private static async userMetadata(userId: mongoose.Types.ObjectId) {
		const count = await MessageService.countMessagesByUser(userId);
		const unread = await MessageService.unreadMessagesByUser(userId);
		return { unread, count };
	}
	// endregion

	// region public members
	// endregion

	// region private members
	private escalationLogic: EscalationLogic;
	// endregion

	// region constructor
	public constructor() {
		this.escalationLogic = new EscalationLogic();
	}
	// endregion

	// region public methods

	public async send(message: RequestMessage): Promise<string> {
		const messageId = await MessageService.save(message);
		await this.escalationLogic.escalate(messageId);
		return messageId;
	}

	public async seen(messageId: string, userId: string) {
		const message = await MessageService.messageSeen(messageId, mongoose.Types.ObjectId(userId));
		return MessageService.filter(message, mongoose.Types.ObjectId(userId));
	}

	public async remove(messageId: string, userId: string) {
		const message = await MessageService.removeReceiverFromMessage(messageId, userId);
		return MessageService.filter(message, mongoose.Types.ObjectId(userId));
	}

	public async removeAll(userId: string) {
		const messages: Message[] = await MessageService.removeAllMessagesFrom(userId);
		return messages.map((message: Message) => MessageService.filter(message, mongoose.Types.ObjectId(userId)));
	}

	public async readAll(userId: string) {
		const messages: Message[] = await MessageService.readAllMessagesFrom(userId);
		return messages.map((message: Message) => MessageService.filter(message, mongoose.Types.ObjectId(userId)));
	}

	public async byUser(userId: string, limit: number, skip: number): Promise<any> {
		const data = await MessageService.messagesByUser(mongoose.Types.ObjectId(userId), limit, skip);
		const meta = await MessageService.userMetadata(mongoose.Types.ObjectId(userId));
		return { data, meta };
	}

	public async byUserAndMessageId(userId: string, messageId: string): Promise<any> {
		const data = await MessageService.messageByUserAndMessageId(
			mongoose.Types.ObjectId(userId),
			mongoose.Types.ObjectId(messageId)
		);
		const meta = await MessageService.userMetadata(mongoose.Types.ObjectId(userId));
		return { data, meta };
	}

	// endregion

	// region private methods
	// endregion
}

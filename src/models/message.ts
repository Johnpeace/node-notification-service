import mongoose from 'mongoose';

export interface IUserRessourceModel extends mongoose.Types.Subdocument {
  name: string;
  mail: string;
  language: string;
  payload: any;
}

export interface IMessageModel extends mongoose.Document {
  platform: string;
  template: string;
  sender: {
    name: string;
    mail: string;
  };
  payload: [
    {
      language: string;
      payload: any;
    }
  ];
  receivers: mongoose.Types.DocumentArray<IUserRessourceModel>;
  trackLinks: boolean;
}

export const userRessourceSchema = new mongoose.Schema({
  name: String,
  mail: String,
  language: String,
  payload: Object,
});

export const messageSchema = new mongoose.Schema({
  platform: String,
  template: String,
  sender: {
    name: String,
    mail: String,
  },
  payload: [
    {
      language: String,
      payload: Object,
    },
  ],
  receivers: [ userRessourceSchema ],
  trackLinks: Boolean,
});

const messageModel: mongoose.Model<IMessageModel> = mongoose.model('Message', messageSchema);

export default messageModel;
type CallStore = {
  meetingId: string;
  name: string;
};

let pending: CallStore | null = null;

export const callStore = {
  clear: () => {
    pending = null;
  },
  get: () => pending,
  set: (data: CallStore) => {
    pending = data;
  },
};

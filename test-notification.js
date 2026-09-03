require("dotenv").config();

const { createNotification } = require("./services/notificationService");

async function test() {
  try {
    const notification = await createNotification({
      userId: 3,
      type: "new_event",
      title: "Test Notification",
      message: "This is your first Circular notification!",
      eventId: null
    });

    console.log("Notification created successfully:");
    console.log(notification);

    process.exit(0);
  } catch (error) {
    console.error("Notification test failed:");
    console.error(error);

    process.exit(1);
  }
}

test();
import { Injectable } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import moment from 'moment-timezone';
import * as dotenv from 'dotenv';
dotenv.config();
@Injectable()
export class GoogleCalendarService {
  private serviceAccount: any;
  private calendarId: string;
  private scopes: string[];
  private codeforcesUrl = 'https://codeforces.com/api/contest.list';

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.calendarId = 'thesaumyaborwankar@gmail.com';
    this.serviceAccount = {
      type: 'service_account',
      project_id: 'contest-track',
      private_key_id: this.configService.get('private_key_id'),
      private_key: this.configService
        .get('private_key')
        .split(String.raw`\n`)
        .join('\n'),
      client_email: 'samm-181@contest-track.iam.gserviceaccount.com',
      client_id: this.configService.get('client_id'),
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: this.configService.get('client_x509_cert_url'),
      universe_domain: 'googleapis.com',
    };
    this.scopes = ['https://www.googleapis.com/auth/calendar'];
  }

  public async createCalendarEvent(
    event: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event> {
    try {
      // Authenticate using the service account info
      const credentials = google.auth.fromJSON(this.serviceAccount) as any;
      credentials.scopes = this.scopes;

      // Build the Google Calendar API service
      const service = google.calendar({ version: 'v3', auth: credentials });
      // const responst = await service.colors.get();
      // console.log(responst.data.calendar.);

      const existingEvents = await service.events.list({
        calendarId: this.calendarId,
        timeMin: event.start?.dateTime!,
        timeMax: event.end?.dateTime!,
        q: event.summary!,
      });

      if (existingEvents.data.items && existingEvents.data.items.length > 0) {
        // console.log(`Event "${event.summary}" already exists.`);
        console.log(
          `Event "${event.summary}" already exists. Updating reminders.`,
        );
        const existingEvent = existingEvents.data.items[0];
        // Update the reminders of the existing event
        const updatedEvent = await service.events.update({
          calendarId: this.calendarId!,
          eventId: existingEvent.id!,
          requestBody: {
            ...existingEvent,
            colorId: '5',
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup', minutes: 30 },
                { method: 'email', minutes: 1440 },
              ],
            },
          },
        });
        return existingEvents.data.items[0]; // Or handle as you need.
      }
      // Create the event
      const createdEvent = await service.events.insert({
        calendarId: this.calendarId,
        requestBody: event,
      });

      console.log(`Event created: ${createdEvent.data.htmlLink}`);
      return createdEvent.data;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error; // Rethrow the error for NestJS error handling
    }
  }

  async getContests(): Promise<any> {
    try {
      const response: any = await this.httpService
        .get(this.codeforcesUrl)
        .toPromise(); // Convert Observable to Promise

      if (response.status !== 200) {
        console.error(`Error: ${response.status}`);
        return null; // Or throw an error, depending on desired behavior
      }

      const data = response.data;

      if (data.status !== 'OK') {
        console.error('Error: status not OK');
        return null; // Or throw an error
      }

      return data.result;
    } catch (error) {
      console.error('Error fetching contests:', error);
      return null; // Or throw an error
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  public async makeCalendarEvents() {
    console.log('runnning');
    const contests = await this.getContests();
    if (!contests) {
      return;
    }
    //  cons await this.httpService.get('https://www.googleapis.com/calendar/v3/colors');
    for (const contest of contests) {
      const startTimeSeconds = contest.startTimeSeconds;

      if (startTimeSeconds === undefined) {
        console.error('Error: startTimeSeconds not found in event data.');
        return;
      }

      const startDatetime = moment.unix(startTimeSeconds).tz('UTC'); // Convert to UTC moment object

      if (startDatetime.isAfter(moment())) {
        // Check if it's in the future
        const event: calendar_v3.Schema$Event = {
          summary: contest.name || 'Event',
          start: {
            dateTime: startDatetime.tz('America/Chicago').toISOString(), // Convert to CST and ISO string
            timeZone: 'America/Chicago',
          },
          end: {
            dateTime: startDatetime
              .add(contest.durationSeconds || 0, 'seconds')
              .tz('America/Chicago')
              .toISOString(), // Convert to CST and ISO string
            timeZone: 'America/Chicago',
          },
          description: `Contest Type: ${contest.type || 'Unknown'}`,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'email', minutes: 1440 },
            ],
          },
        };
        await this.createCalendarEvent(event);
      } else {
        console.log(`Contest ${contest.name} is in the past, skipping.`);
      }
    }
    console.log('done');
  }
}
